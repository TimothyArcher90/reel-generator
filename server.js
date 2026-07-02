require("dotenv").config();
const express = require("express");
const path    = require("path");
const fs      = require("fs");

const { generateScript }    = require("./pipeline/generateScript");
const { generateVoiceover } = require("./pipeline/replicate");
const { generateAllClips }  = require("./pipeline/runway");
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
    const msg = (err && err.message) ? err.message : String(err);
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

  // Step 2 — Voz de Guillermo (MiniMax Speech-02 HD, voice_id clonado)
  upd(jobId, { step: 2, statusMsg: "Generando voz de Guillermo..." });
  log(jobId, "[2/4] Generando voz...");
  const audioFile = path.join(workDir, "audio.mp3");
  const audioUrl = await withTimeout(generateVoiceover(script.voiceover), 180000, "Voiceover timeout");
  await downloadFile(audioUrl, audioFile);
  const duration = await getAudioDuration(audioFile);
  log(jobId, `Voz lista — ${duration}s`);

  // Step 3 — Video clips
  upd(jobId, { step: 3, statusMsg: `Generando ${N} clips de video...` });
  log(jobId, `[3/4] Generando ${N} clips AI (Seedance)...`);
  const clipUrls = await withTimeout(
    generateAllClips(script.videoPrompts, msg => { log(jobId, msg); upd(jobId, { statusMsg: msg }); }),
    1500000, "Video clips timeout"
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
    renderVideo({ clips: clipFiles, audioFile, captions: script.captions, duration, outPath: outMp4 }),
    300000, "ffmpeg render timeout"
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

  // Test modelo COMUNIDAD en Replicate (barato, ~$0.001) — diagnóstico de spend limit
  try {
    const axios = require("axios");
    const rpKey = process.env.REPLICATE_API_KEY || "";
    const r = await axios.post(
      "https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions",
      { input: { prompt: "test", num_outputs: 1 } },
      { headers: { Authorization: `Bearer ${rpKey}`, "Content-Type": "application/json" }, timeout: 15000 }
    );
    results.replicate_community_model = "OK — id: " + r.data.id + " status: " + r.data.status;
  } catch(e) {
    results.replicate_community_model = "ERROR " + (e.response?.status) + " — " + JSON.stringify(e.response?.data)?.slice(0,200);
  }

  // Test candidatos de modelos COMUNIDAD para voz clonada y video (no oficiales, evitan bloqueo de tarjeta)
  const rpKey = process.env.REPLICATE_API_KEY || "";
  const candidates = {
    voice_xtts: "lucataco/xtts-v2",
    video_wan_zsxkib: "zsxkib/wan2.1",
    video_wan_fofr: "fofr/wan2.1-with-vace",
    video_ltx: "fofr/ltx-video"
  };
  for (const [key, model] of Object.entries(candidates)) {
    try {
      const axios = require("axios");
      const r = await axios.get(`https://api.replicate.com/v1/models/${model}`, {
        headers: { Authorization: `Bearer ${rpKey}` }, timeout: 10000
      });
      results[key] = r.data.latest_version ? "EXISTS — " + model : "sin version";
    } catch(e) {
      results[key] = "ERROR " + (e.response?.status || e.message.slice(0,60)) + " — " + model;
    }
  }

  res.json(results);
});

// ── GET /test-voice ── prueba barata (~$0.01) de la voz de Guillermo ────────
app.get("/test-voice", async (req, res) => {
  try {
    const url = await generateVoiceover("Hola, soy Guillermo. Esta es una prueba de mi voz clonada para los reels.");
    res.json({ ok: true, audio: url, nota: "Abre el link 'audio' para escuchar la voz clonada" });
  } catch (e) {
    res.status(500).json({ ok: false, error: (e.response?.data?.detail) || e.message });
  }
});

app.listen(PORT, () => console.log(`Reel Generator → http://localhost:${PORT}`));
