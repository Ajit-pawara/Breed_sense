from fastapi import FastAPI, APIRouter, UploadFile, File, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Dict
import uuid
from datetime import datetime, timezone


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Ensure uploads directory exists
UPLOADS_DIR = ROOT_DIR / "uploads"
UPLOADS_DIR.mkdir(exist_ok=True)

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")


# --------- Models ---------
class StatusCheck(BaseModel):
    model_config = ConfigDict(extra="ignore")  # Ignore MongoDB's _id field
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class StatusCheckCreate(BaseModel):
    client_name: str


class Prediction(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    filename: Optional[str] = None
    content_type: Optional[str] = None
    breed: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# --------- Routes ---------
@api_router.get("/")
async def root():
    return {"message": "Hello World"}


@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate):
    status_dict = input.model_dump()
    status_obj = StatusCheck(**status_dict)

    # Convert to dict and serialize datetime to ISO string for MongoDB
    doc = status_obj.model_dump()
    doc['timestamp'] = doc['timestamp'].isoformat()

    await db.status_checks.insert_one(doc)
    return status_obj


@api_router.get("/status", response_model=List[StatusCheck])
async def get_status_checks():
    # Exclude MongoDB's _id field from the query results
    status_checks = await db.status_checks.find({}, {"_id": 0}).to_list(1000)

    # Convert ISO string timestamps back to datetime objects
    for check in status_checks:
        if isinstance(check.get('timestamp'), str):
            check['timestamp'] = datetime.fromisoformat(check['timestamp'])

    return status_checks


# --------- Mock AI Predict Endpoint + Analytics ---------
BREEDS = ['Jersey', 'Holstein', 'Gir', 'Sahiwal', 'Tharparkar']
ALLOWED_CT = {"image/jpeg", "image/jpg", "image/png", "image/webp"}
ALLOWED_EXT = {".jpg", ".jpeg", ".png", ".webp"}
COW_KEYWORDS = {"cow", "cattle", "bull", "calf", "ox", "heifer", "jersey", "holstein", "gir", "sahiwal", "tharparkar"}


def _mock_breed_choice(seed_text: str) -> str:
    # Deterministic pseudo-random choice based on filename to keep UX consistent per image
    h = 0
    for ch in seed_text:
        h = (h * 131 + ord(ch)) % 1000003
    idx = h % len(BREEDS)
    return BREEDS[idx]


def _looks_like_cow(filename: Optional[str], content_type: Optional[str]) -> bool:
    if not content_type or content_type.lower() not in ALLOWED_CT:
        return False
    if filename:
        ext = Path(filename).suffix.lower()
        if ext not in ALLOWED_EXT:
            return False
        name = filename.lower()
        for kw in COW_KEYWORDS:
            if kw in name:
                return True
    # If we reached here, no filename hint; be conservative in mock mode and reject
    return False


@api_router.post("/predict")
async def predict_cattle_breed(file: UploadFile = File(...)):
    if file.content_type is None:
        raise HTTPException(status_code=400, detail="Please upload an image file")

    # Mock non-cow detection (heuristic: mime/ext + filename keywords)
    if not _looks_like_cow(file.filename or "", file.content_type):
        raise HTTPException(status_code=400, detail="Uploaded image does not appear to be a cow (mock heuristic)")

    try:
        # Save temporarily to uploads (optional)
        suffix = Path(file.filename).suffix if file.filename else ""
        temp_name = f"{uuid.uuid4()}" + suffix
        temp_path = UPLOADS_DIR / temp_name

        contents = await file.read()
        with open(temp_path, 'wb') as f:
            f.write(contents)

        # Mock prediction based on filename (stable) or fallback to generic
        seed = file.filename or "default"
        predicted = _mock_breed_choice(seed)

        # Store prediction in Mongo (analytics)
        pred_obj = Prediction(filename=file.filename, content_type=file.content_type, breed=predicted)
        doc = pred_obj.model_dump()
        # Serialize datetime for Mongo and enforce string UUID _id
        doc['timestamp'] = doc['timestamp'].isoformat()
        doc['_id'] = doc['id']  # enforce non-ObjectId storage
        await db.predictions.insert_one(doc)

        # Keep only last 20 predictions (by timestamp) — simple pruning
        try:
            # get count and delete older ones beyond 20
            total = await db.predictions.count_documents({})
            if total > 20:
                # sort by timestamp asc and remove the extras
                cursor = db.predictions.find({}, {"_id": 1, "timestamp": 1}).sort("timestamp", 1).limit(total - 20)
                to_delete = [d["_id"] async for d in cursor]
                if to_delete:
                    await db.predictions.delete_many({"_id": {"$in": to_delete}})
        except Exception:
            pass

        # Cleanup temp file
        try:
            temp_path.unlink(missing_ok=True)
        except Exception:
            pass

        # Match requested contract strictly
        return {"breed": predicted}
    except HTTPException:
        raise
    except Exception as e:
        logging.exception("Prediction failed: %s", e)
        raise HTTPException(status_code=500, detail="Prediction failed")


@api_router.get("/predictions")
async def get_recent_predictions(limit: int = 20):
    limit = max(1, min(50, limit))
    # Return latest by timestamp desc
    preds = await db.predictions.find({}, {"_id": 0}).sort("timestamp", -1).limit(limit).to_list(length=limit)
    # timestamps are iso strings already
    return preds


@api_router.get("/analytics/summary")
async def get_analytics_summary():
    # Aggregate counts by breed
    pipeline = [
        {"$group": {"_id": "$breed", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
    ]
    agg = await db.predictions.aggregate(pipeline).to_list(length=100)
    by_breed: Dict[str, int] = {a["_id"]: a["count"] for a in agg}
    total = sum(by_breed.values())
    most = max(by_breed, key=by_breed.get) if by_breed else None
    return {"by_breed": by_breed, "total": total, "most_common": most}

from starlette.responses import FileResponse
import zipfile
import tempfile


@api_router.get("/download/source")
async def download_source_zip(variant: str = "ready"):
    """
    Download the project as a ZIP.
    - variant=ready (default): backend, frontend, workflows, Dockerfile, .env.example files, scripts, tests, README.md
    - variant=everything: entire /app except heavy/dev caches
    """
    project_root = str(ROOT_DIR.parent)  # /app

    # Common excludes
    exclude_dirs = {"node_modules", "build", "dist", ".git", "__pycache__", ".pytest_cache", ".next", ".cache", ".ruff_cache"}
    exclude_file_ext = {".pyc", ".log"}

    # Build include list based on variant
    if variant == "ready":
        include_paths = [
            os.path.join(project_root, "backend"),
            os.path.join(project_root, "frontend"),
            os.path.join(project_root, "scripts"),
            os.path.join(project_root, "tests"),
            os.path.join(project_root, ".github"),
            os.path.join(project_root, "README.md"),
        ]
        # Exclude generated test reports by default
        exclude_dirs.add("test_reports")
    else:  # "everything"
        include_paths = [project_root]

    tmp_fd, tmp_path = tempfile.mkstemp(prefix="breedsense_source_", suffix=".zip")
    os.close(tmp_fd)

    zip_root_prefix = "BreedSense/"

    with zipfile.ZipFile(tmp_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for base in include_paths:
            if os.path.isdir(base):
                for root, dirs, files in os.walk(base):
                    # prune excluded dirs
                    dirs[:] = [d for d in dirs if d not in exclude_dirs]
                    for f in files:
                        fp = os.path.join(root, f)
                        _, ext = os.path.splitext(f)
                        if ext.lower() in exclude_file_ext:
                            continue
                        arcname = os.path.relpath(fp, start=project_root)
                        if any(seg in exclude_dirs for seg in arcname.split(os.sep)):
                            continue
                        zf.write(fp, zip_root_prefix + arcname)
            elif os.path.isfile(base):
                arcname = os.path.relpath(base, start=project_root)
                zf.write(base, zip_root_prefix + arcname)

    filename = "breedsense_source.zip"
    return FileResponse(tmp_path, media_type="application/zip", filename=filename)



# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()