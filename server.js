"use strict";

const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawn } = require("child_process");

const app = express();
const PORT = Number(process.env.PORT || 5081);
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "change-this-password";
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || process.env.RENDER_EXTERNAL_URL || "").replace(/\/$/, "");
const MAX_CHANNELS = Math.max(1, Number(process.env.MAX_CHANNELS || 10));
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const HLS_DIR = process.env.HLS_DIR || path.join(__dirname, "hls");
const DB_FILE = path.join(DATA_DIR, "channels.json");

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(HLS_DIR, { recursive: true });
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, "[]");

app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "public")));

function readChannels() {
  try { return JSON.parse(fs.readFileSync(DB_FILE, "utf8")); }
  catch { return []; }
}
function writeChannels(channels) {
  fs.writeFileSync(DB_FILE, JSON.stringify(channels, null, 2));
}
function safeId(value) {
  return /^[a-zA-Z0-9_-]{2,64}$/.test(value || "");
}
function publicChannel(ch) {
  const { inputUrl, rtmpDestination, ...safe } = ch;
  return {
    ...safe,
    hlsUrl: `${PUBLIC_BASE_URL || ""}/hls/${encodeURIComponent(ch.id)}/index.m3u8`,
    running: Boolean(processes.get(ch.id) && !processes.get(ch.id).killed)
  };
}
function auth(req, res, next) {
  const header = req.headers.authorization || "";
  const [scheme, encoded] = header.split(" ");
  if (scheme !== "Basic" || !encoded) {
    res.set("WWW-Authenticate", 'Basic realm="HLS Relay Center"');
    return res.status(401).send("Authentication required");
  }
  let decoded = "";
  try { decoded = Buffer.from(encoded, "base64").toString("utf8"); } catch {}
  const separator = decoded.indexOf(":");
  const user = decoded.slice(0, separator);
  const pass = decoded.slice(separator + 1);
  const expectedUser = Buffer.from(ADMIN_USER);
  const actualUser = Buffer.from(user);
  const okUser = actualUser.length === expectedUser.length &&
    crypto.timingSafeEqual(actualUser, expectedUser);
  const expected = Buffer.from(ADMIN_PASSWORD);
  const actual = Buffer.from(pass);
  const okPass = actual.length === expected.length &&
    crypto.timingSafeEqual(actual, expected);
  if (!okUser || !okPass) {
    res.set("WWW-Authenticate", 'Basic realm="HLS Relay Center"');
    return res.status(401).send("Invalid credentials");
  }
  next();
}

const processes = new Map();
const logs = new Map();

function validateStreamUrl(value, optional = false) {
  if (!value && optional) return true;
  try {
    const u = new URL(value);
    return ["http:", "https:", "rtmp:", "rtmps:", "rtmpe:", "rtmpt:"].includes(u.protocol);
  } catch { return false; }
}

function stopChannel(id) {
  const proc = processes.get(id);
  if (proc && !proc.killed) {
    proc.kill("SIGTERM");
    setTimeout(() => {
      if (processes.get(id) === proc && !proc.killed) proc.kill("SIGKILL");
    }, 5000).unref();
  }
  processes.delete(id);
}

function startChannel(ch) {
  if (processes.has(ch.id)) return;
  if (processes.size >= MAX_CHANNELS) throw new Error(`Maximum ${MAX_CHANNELS} concurrent channels reached.`);
  if (!validateStreamUrl(ch.inputUrl)) throw new Error("Invalid input URL");

  const outputDir = path.join(HLS_DIR, ch.id);
  fs.mkdirSync(outputDir, { recursive: true });
  for (const f of fs.readdirSync(outputDir)) {
    try { fs.unlinkSync(path.join(outputDir, f)); } catch {}
  }

  const playlist = path.join(outputDir, "index.m3u8");
  const segment = path.join(outputDir, "segment_%05d.ts");
  const args = [
    "-hide_banner", "-loglevel", "warning",
    "-nostdin", "-y",
    "-i", ch.inputUrl,
    "-map", "0:v?", "-map", "0:a?",
    "-c", "copy",
    "-f", "hls",
    "-hls_time", "4",
    "-hls_list_size", "8",
    "-hls_flags", "delete_segments+independent_segments+temp_file",
    "-hls_segment_filename", segment,
    playlist
  ];

  // Optional second output. Stream copy avoids unnecessary transcoding.
  if (ch.rtmpDestination) {
    args.push(
      "-map", "0:v?", "-map", "0:a?",
      "-c", "copy", "-f", "flv", ch.rtmpDestination
    );
  }

  const proc = spawn(process.env.FFMPEG_PATH || "ffmpeg", args, {
    stdio: ["ignore", "ignore", "pipe"]
  });
  processes.set(ch.id, proc);
  logs.set(ch.id, []);

  proc.stderr.on("data", data => {
    const lines = (logs.get(ch.id) || []).concat(data.toString().split(/\r?\n/).filter(Boolean));
    logs.set(ch.id, lines.slice(-100));
  });
  proc.on("error", err => {
    logs.set(ch.id, (logs.get(ch.id) || []).concat(`FFmpeg error: ${err.message}`).slice(-100));
    processes.delete(ch.id);
  });
  proc.on("exit", (code, signal) => {
    logs.set(ch.id, (logs.get(ch.id) || []).concat(`FFmpeg exited: code=${code}, signal=${signal}`).slice(-100));
    if (processes.get(ch.id) === proc) processes.delete(ch.id);
  });
}

app.use("/api", auth);

app.get("/api/channels", (req, res) => {
  res.json(readChannels().map(publicChannel));
});

app.get("/api/channels/:id/config", (req, res) => {
  const ch = readChannels().find(c => c.id === req.params.id);
  if (!ch) return res.status(404).json({ error: "Channel not found." });
  res.json({ name: ch.name, id: ch.id, inputUrl: ch.inputUrl, rtmpDestination: ch.rtmpDestination || "", logo: ch.logo || "" });
});

app.post("/api/channels", (req, res) => {
  const { name, id, inputUrl, rtmpDestination = "", logo = "" } = req.body || {};
  if (!name || !safeId(id) || !validateStreamUrl(inputUrl) ||
      !validateStreamUrl(rtmpDestination, true)) {
    return res.status(400).json({ error: "Provide a name, valid channel ID, and valid input URL." });
  }
  const channels = readChannels();
  if (channels.length >= MAX_CHANNELS) return res.status(400).json({ error: `This deployment is limited to ${MAX_CHANNELS} channels.` });
  if (channels.some(c => c.id === id)) return res.status(409).json({ error: "Channel ID already exists." });
  const ch = { name: String(name).slice(0, 100), id, inputUrl, rtmpDestination, logo: String(logo).slice(0, 500), createdAt: Date.now() };
  channels.push(ch);
  writeChannels(channels);
  res.status(201).json(publicChannel(ch));
});

app.put("/api/channels/:id", (req, res) => {
  const channels = readChannels();
  const ch = channels.find(c => c.id === req.params.id);
  if (!ch) return res.status(404).json({ error: "Channel not found." });
  const { name, inputUrl, rtmpDestination = "", logo = "" } = req.body || {};
  if (!name || !validateStreamUrl(inputUrl) || !validateStreamUrl(rtmpDestination, true)) {
    return res.status(400).json({ error: "Invalid channel details." });
  }
  const wasRunning = processes.has(ch.id);
  if (wasRunning) stopChannel(ch.id);
  Object.assign(ch, {
    name: String(name).slice(0, 100), inputUrl,
    rtmpDestination, logo: String(logo).slice(0, 500)
  });
  writeChannels(channels);
  res.json(publicChannel(ch));
});

app.delete("/api/channels/:id", (req, res) => {
  const channels = readChannels();
  if (!channels.some(c => c.id === req.params.id)) return res.status(404).json({ error: "Channel not found." });
  stopChannel(req.params.id);
  writeChannels(channels.filter(c => c.id !== req.params.id));
  res.json({ ok: true });
});

app.post("/api/channels/:id/start", (req, res) => {
  const ch = readChannels().find(c => c.id === req.params.id);
  if (!ch) return res.status(404).json({ error: "Channel not found." });
  try { startChannel(ch); res.json({ ok: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

app.post("/api/channels/:id/stop", (req, res) => {
  stopChannel(req.params.id);
  res.json({ ok: true });
});

app.post("/api/channels/start-all", (req, res) => {
  const errors = [];
  for (const ch of readChannels()) {
    try { startChannel(ch); } catch (e) { errors.push(`${ch.name}: ${e.message}`); }
  }
  res.json({ ok: errors.length === 0, errors });
});

app.post("/api/channels/stop-all", (req, res) => {
  for (const id of processes.keys()) stopChannel(id);
  res.json({ ok: true });
});

app.get("/api/channels/:id/logs", (req, res) => {
  res.json({ lines: logs.get(req.params.id) || [] });
});

app.use("/hls", express.static(HLS_DIR, {
  setHeaders(res) {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Cache-Control", "no-cache, no-store, must-revalidate");
    res.set("Access-Control-Allow-Headers", "Range");
  }
}));

app.get("/health", (req, res) => res.json({ ok: true, ffmpeg: process.env.FFMPEG_PATH || "ffmpeg" }));

app.listen(PORT, "0.0.0.0", () => {
  console.log(`HLS Relay Center listening on port ${PORT}`);
  if (process.env.AUTO_START_CHANNELS === "true") {
    setTimeout(() => {
      for (const ch of readChannels()) {
        try { startChannel(ch); }
        catch (err) { console.error(`Could not auto-start ${ch.id}: ${err.message}`); }
      }
    }, 1500).unref();
  }
});
