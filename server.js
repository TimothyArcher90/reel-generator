require("dotenv").config();
const express = require("express");
const path    = require("path");
const fs      = require("fs");

const { generateScript }    = require("./pipeline/generateScript");
const edgeTts      = require("./pipeline/edgetts");
const elevenLabs   = require("./pipeline/elevenlabs");
// Usa la voz clonada de Guillermo (ElevenLabs) si está configurada; si no, cae a Edge-TTS gratis.
const useElevenLabs = !!(process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_VOICE_ID);
const { generateVoiceover } = useElevenLabs ? elevenLabs : edgeTts;
const { generateAllClips }  = require("./pipeline/higgsfieldCloud");
const { downloadFile, getAudioDuration } = require("./pipeline/higgsfield");
const { renderVideo }       = require("./pipeline/renderVideo");

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.static("public"));
app.use(express.json({ limit: "2mb" }));

fs.mkdirSync("outputs", { recursive: true });

// ── Job store ────────────────────────────────────────────────────────────────
const jobs = new Map();

function upd(id, patch) {
  jobs.set(id, { ...jobs.get(id), ...patch });
}
function log(id, msg) {
  const j = jobs.get(id) || {};
  const logs = [...(j.logs || []), msg];
  jobs.set(id, { ...j, logs });
  console.log(`[${id}] ${msg}`);
}

// ── POST /start ── receives {text} extracted by PDF.js in browser ─────────
app.post("/start", (req, res) => {
  const { text, filename } = req.body;
  if (!text || text.length < 100) return res.status(400).json({ error: "Texto muy corto o vacío" });

  const jobId = Date.now().toString();
  jobs.set(jobId, { status: "running", step: 0, total: 4, logs: [], error: null, downloadUrl: null, statusMsg: "Iniciando..." });
  res.json({ jobId });

  runPipeline(jobId, text, filename || "reel").catch(err => {
    const msg = friendlyError(err);
    log(jobId, "FATAL: " + msg);
    upd(jobId, { status: "error", error: msg });
  });
});

// ── GET /status/:jobId ────────────────────────────────────────────────────
app.get("/status/:jobId", (req, res) => {
  const j = jobs.get(req.params.jobId);
  if (!j) return res.status(404).json({ error: "Job no encontrado" });
  res.json(j);
});

// ── GET /download/:file ───────────────────────────────────────────────────
app.get("/download/:file", (req, res) => {
  const file = path.join("outputs", req.params.file);
  if (!fs.existsSync(file)) return res.status(404).send("Not found");
  res.download(file);
});

// ── Pipeline ─────────────────────────────────────────────────────────────
async function runPipeline(jobId, text, baseFilename) {
  const workDir = path.join("outputs", jobId);
  fs.mkdirSync(workDir, { recursive: true });

  // Step 1 — Script
  upd(jobId, { step: 1, statusMsg: "Claude generando guion..." });
  log(jobId, "[1/4] Generando guion...");
  const script = await withTimeout(generateScript(text), 90000, "Script timeout");
  const N = script.captions.length;
  log(jobId, `Guion listo: "${script.title}" — ${N} segmentos`);

  // Step 2 — Voz (ElevenLabs con voz clonada de Guillermo si está configurada; si no, Edge-TTS gratis)
  upd(jobId, { step: 2, statusMsg: "Generando voz..." });
  log(jobId, `[2/4] Generando voz (${useElevenLabs ? "ElevenLabs — Guillermo" : "Edge-TTS gratis"})...`);
  const audioFile = path.join(workDir, "audio.mp3");
  await withTimeout(generateVoiceover(script.voiceover, audioFile), 120000, "Voiceover timeout");
  const duration = await getAudioDuration(audioFile);
  log(jobId, `Voz lista — ${duration}s`);

  // Step 3 — Video clips (Higgsfield Cloud: imagen Soul + animación DoP por segmento)
  const segDur = Math.max(3, duration / N);
  // Pares imagen/movimiento; fallback a videoPrompts si el guion viene en formato viejo
  const visualPrompts = (script.imagePrompts && script.motionPrompts)
    ? script.imagePrompts.map((img, i) => ({ image: img, motion: script.motionPrompts[i] || "slow cinematic camera movement" }))
    : (script.videoPrompts || []);
  upd(jobId, { step: 3, statusMsg: `Generando ${N} clips de video...` });
  log(jobId, `[3/4] Generando ${N} clips (Higgsfield Soul+DoP, ~${segDur.toFixed(1)}s c/u)...`);
  const clipUrls = await withTimeout(
    generateAllClips(visualPrompts, segDur, msg => { log(jobId, msg); upd(jobId, { statusMsg: msg }); }),
    Math.max(1500000, N * 400000), "Video clips timeout" // imagen+video por segmento, escala con N
  );
  const clipFiles = [];
  for (let i = 0; i < clipUrls.length; i++) {
    const dest = path.join(workDir, `clip${i + 1}.mp4`);
    await downloadFile(clipUrls[i], dest);
    clipFiles.push(dest);
    log(jobId, `Clip ${i + 1}/${N} descargado`);
    upd(jobId, { statusMsg: `Descargando clips... ${i + 1}/${N}` });
  }

  // Step 4 — Render MP4
  upd(jobId, { step: 4, statusMsg: "Renderizando MP4 con ffmpeg..." });
  log(jobId, "[4/4] Renderizando con ffmpeg...");
  const outMp4 = path.join("outputs", `${jobId}.mp4`);
  await withTimeout(
    renderVideo({ clips: clipFiles, audioFile, duration, outPath: outMp4 }),
    Math.max(300000, N * 40000), "ffmpeg render timeout" // escala con N (procesa + N-1 merges xfade)
  );

  upd(jobId, {
    status: "done",
    step: 4,
    statusMsg: "¡Listo!",
    title: script.title,
    downloadUrl: `/download/${jobId}.mp4`
  });
  log(jobId, `Pipeline completo → ${jobId}.mp4`);
}

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(label)), ms))
  ]);
}

// Traduce errores técnicos a mensajes accionables para el equipo (sin llamar a David)
function friendlyError(err) {
  const raw = (err && err.message) ? err.message : String(err);
  const status = err?.response?.status;
  const body = JSON.stringify(err?.response?.data || "").toLowerCase();

  if (raw.includes("SIN CRÉDITO en Higgsfield")) return raw;
  if (raw.includes("ELEVENLABS_API_KEY") || raw.includes("ELEVENLABS_VOICE_ID")) return raw;
  if (status === 401 && body.includes("elevenlabs")) {
    return "CLAVE DE ELEVENLABS INVÁLIDA o sin créditos — revisar ELEVENLABS_API_KEY en Railway y el plan en elevenlabs.io.";
  }
  if (status === 402 || body.includes("insufficient credit")) {
    return "SIN CRÉDITO en Replicate (voz) — recargar en replicate.com/account/billing y reintentar en unos minutos.";
  }
  if (status === 401 || body.includes("unauthenticated") || body.includes("invalid api key")) {
    return "CLAVE API INVÁLIDA — revisar las variables de API en Railway (HF_CLOUD_KEY/SECRET o REPLICATE_API_KEY).";
  }
  if (status === 429) {
    return "LÍMITE DE VELOCIDAD del proveedor — esperar 2-3 minutos y volver a intentar.";
  }
  if (raw.includes("timeout") || raw.includes("Timeout")) {
    return "TIEMPO AGOTADO en un paso (" + raw + ") — volver a intentar; si se repite, avisar al administrador.";
  }
  return raw;
}

// ── GET /test ── diagnóstico rápido ─────────────────────────────────────────
app.get("/test", async (req, res) => {
  const results = {};
  // Test Anthropic
  try {
    const Anthropic = require("@anthropic-ai/sdk");
    const c = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 15000 });
    const r = await c.messages.create({
      model: "claude-haiku-4-5-20251001", max_tokens: 10,
      messages: [{ role: "user", content: "Di: OK" }]
    });
    results.anthropic = "OK — " + r.content[0].text;
  } catch(e) { results.anthropic = "ERROR: " + e.message; }

  // Test Replicate
  try {
    const axios = require("axios");
    const rpKey = process.env.REPLICATE_API_KEY || "";
    results.replicate_key = rpKey ? "presente (" + rpKey.slice(0,8) + "...)" : "FALTA";
    const rpRes = await axios.get("https://api.replicate.com/v1/account", {
      headers: { Authorization: `Bearer ${rpKey}` }, timeout: 10000
    });
    results.replicate_api = "OK — " + (rpRes.data.username || rpRes.status);
  } catch(e) { results.replicate_api = "ERROR " + (e.response?.status || e.code || e.message.slice(0,80)); }

  // Test Runway
  try {
    const axios = require("axios");
    const rwKey = process.env.RUNWAY_API_KEY || "";
    results.runway_key = rwKey ? "presente (" + rwKey.slice(0,8) + "...)" : "FALTA";
    const rwRes = await axios.get("https://api.runwayml.com/v1/tasks", {
      headers: { Authorization: `Bearer ${rwKey}`, "X-Runway-Version": "2024-11-06" },
      timeout: 10000, params: { limit: 1 }
    });
    results.runway_api = "OK — status " + rwRes.status;
  } catch(e) { results.runway_api = "ERROR " + (e.response?.status || e.code || e.message.slice(0,80)); }

  // Test ffmpeg-static
  try {
    const ffmpegPath = require("ffmpeg-static");
    results.ffmpeg = ffmpegPath ? "OK — " + ffmpegPath : "ERROR: path vacío";
  } catch(e) { results.ffmpeg = "ERROR: " + e.message.slice(0,100); }

  // Test Edge-TTS
  try {
    const { MsEdgeTTS, OUTPUT_FORMAT } = require("msedge-tts");
    const tts = new MsEdgeTTS();
    await tts.setMetadata("es-CO-GonzaloNeural", OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    results.edgetts = "OK — voz es-CO-GonzaloNeural lista";
  } catch(e) { results.edgetts = "ERROR: " + String(e).slice(0,200); }

  // Test Pexels
  try {
    const axios = require("axios");
    const pKey = process.env.PEXELS_API_KEY || "";
    results.pexels_key = pKey ? "presente" : "FALTA — agrega PEXELS_API_KEY en Railway";
    if (pKey) {
      const r = await axios.get("https://api.pexels.com/videos/search", {
        headers: { Authorization: pKey }, params: { query: "business", per_page: 1 }, timeout: 8000
      });
      results.pexels_api = "OK — " + r.data.total_results + " videos";
    }
  } catch(e) { results.pexels_api = "ERROR: " + (e.response?.status || e.message.slice(0,80)); }

  res.json(results);
});

// ── GET /test-voice ── prueba de la voz activa (ElevenLabs/Guillermo o Edge-TTS) ──
app.get("/test-voice", async (req, res) => {
  try {
    const out = path.join("outputs", "test-voice.mp3");
    await generateVoiceover("Hola, esta es una prueba de la voz para los reels del equipo.", out);
    res.json({
      ok: true,
      voice: useElevenLabs ? "ElevenLabs (Guillermo)" : "Edge-TTS (gratis, genérica)",
      audio: "/download/test-voice.mp3",
      nota: "Abre el link 'audio' para escuchar la voz"
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: friendlyError(e) });
  }
});

// ── GET /test-image ── prueba barata de Higgsfield Cloud (1 imagen Soul) ─────
app.get("/test-image", async (req, res) => {
  try {
    const { generateImage } = require("./pipeline/higgsfieldCloud");
    const url = await generateImage("Low-angle shot of a glass and steel financial skyscraper photographed from the base looking up, lit by a single strong light source from the left casting hard shadows, cinematic lighting, high contrast, sharp focus, powerful composition, 9:16 vertical, photorealistic, 8k, bold dramatic color grade, no text, no logos, no floating particles, no fog, no people");
    res.json({ ok: true, image: url, nota: "Si ves la imagen, las claves de Higgsfield Cloud funcionan" });
  } catch (e) {
    res.status(500).json({ ok: false, error: friendlyError(e) });
  }
});

app.listen(PORT, () => console.log(`Reel Generator → http://localhost:${PORT}`));
