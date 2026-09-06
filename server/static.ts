import express from 'express';
import type { Express } from 'express';
import fs from "node:fs";
import path from "node:path";

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath));

  // Stripe (and some link previews) can strip the `#` from success_url,
  // landing the user on non-hash paths like `/thanks?type=...`. The SPA uses
  // hash routing (`/#/thanks?...`), so translate any known top-level SPA path
  // into its hash-routed equivalent, preserving the query string.
  const SPA_ROUTES = new Set([
    "/thanks", "/sessions", "/rules", "/crew", "/merch", "/cart",
    "/admin", "/admin/checkin",
  ]);
  app.get("/{*path}", (req, res, next) => {
    // Only redirect exact SPA top-level paths (or /sessions/:slug).
    const p = req.path.replace(/\/$/, "") || "/";
    const isKnown = SPA_ROUTES.has(p) || /^\/sessions\/[^/]+$/.test(p);
    if (!isKnown) return next();
    const qs = req.url.includes("?") ? req.url.substring(req.url.indexOf("?")) : "";
    return res.redirect(302, `/#${p}${qs}`);
  });

  // fall through to index.html if the file doesn't exist
  app.use("/{*path}", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
