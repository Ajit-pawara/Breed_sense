import React, { useEffect, useMemo, useState } from "react";
import "@/App.css";
import { BrowserRouter } from "react-router-dom";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Toaster, toast } from "@/components/ui/sonner";
import { Github, Linkedin } from "lucide-react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

function useActiveSection(ids) {
  const [active, setActive] = useState(ids[0]);
  useEffect(() => {
    const observers = [];
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      const obs = new IntersectionObserver(
        (entries) => {
          entries.forEach((e) => {
            if (e.isIntersecting) setActive(id);
          });
        },
        { rootMargin: "-40% 0px -55% 0px", threshold: [0, 0.2, 0.6, 1] },
      );
      obs.observe(el);
      observers.push(obs);
    });
    return () => observers.forEach((o) => o.disconnect());
  }, [ids]);
  return active;
}

function Navbar({ sections, active }) {
  const logoUrl = (typeof window !== 'undefined' && window.__BREEDSENSE_LOGO__) || "";
  return (
    <div className="nav-float mx-auto max-w-6xl">
      <div className="glass glow-hover rounded-2xl px-4 md:px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2 select-none">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt="BreedSense Logo"
              data-testid="site-logo"
              className="h-8 w-8 rounded-xl object-contain bg-white/5 ring-1 ring-emerald-300/30"
            />
          ) : (
            <div className="h-8 w-8 rounded-xl bg-emerald-400/20 ring-1 ring-emerald-300/30 flex items-center justify-center">
              <span className="text-emerald-200 text-sm font-semibold">BS</span>
            </div>
          )}
          <span className="text-sm md:text-base font-semibold tracking-wide">BreedSense</span>
        </div>
        <nav className="hidden md:flex items-center gap-2">
          {sections.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              data-testid={`nav-${s.id}-link`}
              className={`px-3 py-2 rounded-full text-sm transition-colors ${
                active === s.id
                  ? "bg-emerald-400/15 text-white ring-1 ring-emerald-300/40"
                  : "hover:bg-white/10 text-zinc-200"
              }`}
            >
              {s.label}
            </a>
          ))}
        </nav>
        <div className="md:hidden">
          <a
            href="#upload"
            data-testid="mobile-upload-cta"
            className="px-3 py-2 rounded-full text-sm bg-emerald-500/20 ring-1 ring-emerald-400/40"
          >
            Upload
          </a>
        </div>
      </div>
    </div>
  );
}

function HomeSection() {
  const onUploadClick = () => {
    toast("⚠️ Background is not added yet… funny project ongoing 😎");
    const el = document.getElementById("upload");
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  return (
    <section id="home" className="section max-w-6xl mx-auto px-4 md:px-6 flex items-center">
      <div className="grid md:grid-cols-2 gap-8 items-center w-full">
        <div className="fade-in-up space-y-6">
          <h1 className="hero-title text-4xl md:text-6xl font-bold leading-tight">
            AI-Powered Cattle Breed Recognition
          </h1>
          <p className="hero-text text-zinc-300 text-base md:text-lg">
            Experience the next generation of agricultural intelligence — identify cattle breeds instantly using precision AI and deep learning.
          </p>
          <div className="flex gap-3">
            <Button
              onClick={onUploadClick}
              data-testid="home-upload-button"
              className="rounded-full px-6 h-12 bg-emerald-500/80 hover:bg-emerald-500 text-white ring-1 ring-emerald-300/50 glow-hover"
            >
              Upload Image
            </Button>
          </div>
        </div>
        <div className="hidden md:block"></div>
      </div>
    </section>
  );
}

function AboutSection() {
  return (
    <section id="about" className="section max-w-6xl mx-auto px-4 md:px-6 flex items-center">
      <Card className="glass w-full rounded-2xl">
        <CardHeader>
          <CardTitle className="text-2xl md:text-3xl">About BreedSense</CardTitle>
          <CardDescription>
            BreedSense is an AI-powered platform designed to identify cattle breeds instantly using advanced deep learning algorithms. Farmers, researchers, and veterinarians can now recognize breeds accurately and efficiently.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="grid md:grid-cols-2 gap-3 text-sm md:text-base">
            <li className="flex items-center gap-2" data-testid="about-feature-1">✅ Instant cattle breed identification</li>
            <li className="flex items-center gap-2" data-testid="about-feature-2">✅ High accuracy</li>
            <li className="flex items-center gap-2" data-testid="about-feature-3">✅ Mobile and desktop friendly</li>
            <li className="flex items-center gap-2" data-testid="about-feature-4">✅ Analytics dashboard</li>
          </ul>
        </CardContent>
      </Card>
    </section>
  );
}

function UploadSection() {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const onSubmit = async () => {
    if (!file) {
      toast("Please choose an image first");
      return;
    }
    try {
      setLoading(true);
      setResult(null);
      const formData = new FormData();
      formData.append("file", file);
      const { data } = await axios.post(`${API}/predict`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setResult(data);
      toast.success(`Detected Breed: ${data.breed}`);
      // refresh analytics
      await fetchPredictions();
    } catch (e) {
      const msg = e?.response?.data?.detail || "Prediction failed. Try another image.";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  // shared state via window for simplicity in MVP
  const [preds, setPreds] = useState([]);
  async function fetchPredictions() {
    try {
      const { data } = await axios.get(`${API}/predictions?limit=20`);
      setPreds(data || []);
      window.__BREEDSENSE_PREDS__ = data || [];
    } catch (e) {
      // ignore silently in MVP
    }
  }
  useEffect(() => { fetchPredictions(); }, []);

  return (
    <section id="upload" className="section max-w-6xl mx-auto px-4 md:px-6 flex items-center">
      <Card className="glass w-full rounded-2xl">
        <CardHeader>
          <CardTitle className="text-2xl">Upload Image</CardTitle>
          <CardDescription>Upload a cattle image to detect its breed.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid md:grid-cols-[1fr_auto] gap-3 items-end">
            <div>
              <Label htmlFor="image" className="mb-2 block">Image</Label>
              <Input
                id="image"
                data-testid="upload-file-input"
                type="file"
                accept="image/*"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="glow-hover"
              />
            </div>
            <Button
              onClick={onSubmit}
              data-testid="upload-submit-button"
              disabled={loading}
              className="rounded-full h-10 px-6 bg-emerald-500/80 hover:bg-emerald-500 text-white ring-1 ring-emerald-300/50"
            >
              {loading ? "Predicting…" : "Upload & Predict"}
            </Button>
          </div>
          {result && (
            <div className="pt-2">
              <div
                data-testid="prediction-result"
                className="inline-flex items-center gap-2 rounded-full px-4 py-2 bg-emerald-400/15 ring-1 ring-emerald-300/30 text-emerald-100"
              >
                <span className="opacity-80">Detected Breed:</span>
                <span className="font-semibold">{result.breed}</span>
              </div>
            </div>
          )}
          {/* Quick peek at last predictions under upload card */}
          {preds?.length > 0 && (
            <div className="pt-2">
              <div className="text-sm text-zinc-400 mb-2">Last predictions</div>
              <div className="grid md:grid-cols-3 gap-3">
                {preds.slice(0, 6).map((p, idx) => (
                  <div key={idx} className="glass rounded-xl px-3 py-2 text-sm flex items-center justify-between">
                    <span className="text-zinc-300">{p.filename || "image"}</span>
                    <span className="font-semibold">{p.breed}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

function AnalyticsSection() {
  const [preds, setPreds] = useState(() => window.__BREEDSENSE_PREDS__ || []);
  useEffect(() => {
    async function load() {
      try {
        const { data } = await axios.get(`${API}/predictions?limit=20`);
        setPreds(data || []);
      } catch (e) {}
    }
    load();
  }, []);

  const total = preds.length;
  const counts = preds.reduce((acc, p) => { acc[p.breed] = (acc[p.breed] || 0) + 1; return acc; }, {});
  const most = Object.entries(counts).sort((a,b) => b[1]-a[1])[0]?.[0] || "—";

  return (
    <section id="analytics" className="section max-w-6xl mx-auto px-4 md:px-6 flex items-center">
      <div className="grid md:grid-cols-3 gap-4 w-full">
        {[{ k: "Most Recognized Breed", v: most, id: "most" }, { k: "Images Processed", v: String(total), id: "count" }, { k: "Tracked Breeds", v: String(Object.keys(counts).length), id: "tracked" }].map((c) => (
          <Card key={c.id} className="glass rounded-2xl glow-hover">
            <CardHeader>
              <CardDescription data-testid={`analytics-${c.id}-label`}>{c.k}</CardDescription>
              <CardTitle data-testid={`analytics-${c.id}-value`} className="text-2xl">{c.v}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>
    </section>
  );
}

function ContactSection() {
  return (
    <section id="contact" className="section max-w-6xl mx-auto px-4 md:px-6 flex items-center">
      <Card className="glass w-full rounded-2xl">
        <CardHeader>
          <CardTitle className="text-2xl">Contact</CardTitle>
          <CardDescription>
            Government College of Engineering, Karad
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="space-y-1">
            <div data-testid="contact-developer">Developer: Ajit Pawara (Robin)</div>
            <div className="text-sm text-zinc-400">Let's connect</div>
          </div>
          <div className="flex items-center gap-3">
            <a data-testid="contact-github" href="#" className="glow-hover p-2 rounded-full ring-1 ring-white/15 hover:bg-white/10" aria-label="GitHub">
              <Github className="text-zinc-100" />
            </a>
            <a data-testid="contact-linkedin" href="#" className="glow-hover p-2 rounded-full ring-1 ring-white/15 hover:bg-white/10" aria-label="LinkedIn">
              <Linkedin className="text-zinc-100" />
            </a>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

function Footer() {
  return (
    <footer className="max-w-6xl mx-auto px-4 md:px-6 pb-10 text-center">
      <div data-testid="footer-text" className="text-sm text-zinc-400">© 2025 BreedSense | Designed by GCEK_Ignite</div>
    </footer>
  );
}

function BackgroundVideo() {
  const [error, setError] = useState(false);
  const src = useMemo(() => {
    const uploaded = typeof window !== 'undefined' && window.__BREEDSENSE_BG__;
    return uploaded || "https://cdn.coverr.co/videos/coverr-cows-on-a-field-9759/1080p.mp4";
  }, []);
  return (
    <>
      {!error && (
        <video
          className="app-bg-video"
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          onCanPlay={(e) => { try { e.currentTarget.play(); } catch {} }}
          onError={() => setError(true)}
          data-testid="background-video"
        >
          <source src={src} type="video/mp4" />
        </video>
      )}
      {/* global overlay for legibility */}
      <div className="background-overlay" />
      <div className="bg-overlay" />
    </>
  );
}

function AppShell() {
  const sections = [
    { id: "home", label: "Home" },
    { id: "about", label: "About" },
    { id: "upload", label: "Upload" },
    { id: "analytics", label: "Analytics" },
    { id: "contact", label: "Contact" },
  ];
  const active = useActiveSection(sections.map((s) => s.id));

  // Initial ping to backend
  useEffect(() => {
    axios.get(`${API}/`).catch(() => {});
  }, []);

  return (
    <div className="min-h-screen relative">
      <BackgroundVideo />
      <Navbar sections={sections} active={active} />
      <main className="space-y-12 md:space-y-16 pt-6">
        <HomeSection />
        <AboutSection />
        <UploadSection />
        <AnalyticsSection />
        <ContactSection />
        <Footer />
      </main>
      <Toaster richColors position="top-center" />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  );
}