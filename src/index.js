// Runtime-configurable assets (safe globals for MVP)
window.__BREEDSENSE_BG__ = "https://customer-assets.emergentagent.com/job_cattleai/artifacts/8d31jsuj_bg.mp4";
// Optional: set to a PNG logo URL when available
// window.__BREEDSENSE_LOGO__ = "https://your-cdn.com/logo.png";

import React from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import App from "@/App";

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
