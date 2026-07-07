require("dotenv").config();
const express = require("express");
const path    = require("path");
const fs      = require("fs");

const { generateScript }    = require("./pipeline/generateScript");
const edgeTts      = require("./pipeline/edgetts");
const elevenLabs   = require("./pipeline/elevenlabs");
const { generateAllClips, generateVoiceoverHiggsfield, GUILLERMO_VOICE_ID } = require("./pipeline/higgsfieldCloud");
const ltxSpace = require("./pipeline/ltxSpace");
const pexels = require("./pipeline/pexels");
const { downloadFile, getAudioDuration } = require("./pipeline/higgsfield");

// Motor de video: Higgsfield Cloud (pago, saldo agotado 2026-07-06) vs
// LTX-Video vía Hugging Face Space gratis (ZeroGPU, cuota diaria limitada) con
// respaldo automático a Pexels (video de stock real, gratis, sin límite de
// cuota de GPU) si LTX falla en cualquier clip. Sin tope de clips: cada uno
// intenta LTX primero y cae a Pexels si falla, así el reel siempre se completa
// con el número real de segmentos del guion.
const useLTXVideo = true;

async function generateAllClipsLTX(prompts, segDurSeconds, onProgress) {
  const urls = [];
  for (let i = 0; i < prompts.length; i++) {
    const p = prompts[i];
    const imagePrompt  = typeof p === "string" ? p : p.image;
    const motionPrompt = typeof p === "string" ? "slow cinematic camera movement" : p.motion;
    onProgress(`Clip ${i + 1}/${prompts.length}: generando video (LTX-Video, gratis)...`);
    let videoUrl;
    try {
      videoUrl = await ltxSpace.generateClip(`${imagePrompt}. ${motionPrompt}`, segDurSeconds);
    } catch (e) {
      // LTX-Video (cuota gratis compartida) puede fallar en cualquier momento — en
      // vez de tirar el reel completo, cae a un video de stock real de Pexels
      // (también gratis) sobre el mismo tema, así el reel SIEMPRE se completa.
      onProgress(`Clip ${i + 1}/${prompts.length}: LTX-Video falló (${e.message.slice(0, 100)}) — usando video de stock de Pexels`);
      const query = imagePrompt.split(",")[0].split(" ").slice(0, 6).join(" ");
      videoUrl = await pexels.searchVideo(query);
    }
    urls.push({ type: "video", url: videoUrl });
    onProgress(`Clip ${i + 1}/${prompts.length}: listo`);
  }
  return urls;
}

// Higgsfield Cloud API NO tiene modelo de texto-a-voz disponible en este plan/cuenta
// (confirmado 2026-07-06: no aparece en el catálogo de /dashboard, todos los intentos
// contra text2speech_v2 dan 404). Queda solo como endpoint de diagnóstico manual
// (GET /test-voice-higgsfield) hasta que Higgsfield lo habilite — NO se usa en el pipeline.
const useHiggsfieldVoice = false;
// ElevenLabs deshabilitado a propósito (2026-07-06): saldo de ElevenAPI insuficiente,
// sigue fallando con 401/quota_exceeded. Forzado a Edge-TTS gratis hasta resolver eso
// aparte — no depende de borrar las variables en Railway.
const useElevenLabs = false;
const voiceEngineName = useHiggsfieldVoice ? "Higgsfield (Guillermo)" : useElevenLabs ? "ElevenLabs (Guillermo)" : "Edge-TTS (gratis, genérica)";

async function generateVoiceoverHiggsfieldToFile(text, outputPath) {
  const url = await generateVoiceoverHiggsfield(text, GUILLERMO_VOICE_ID);
  await downloadFile(url, outputPath);
  return outputPath;
}

const { generateVoiceover } = useHiggsfieldVoice
  ? { generateVoiceover: generateVoiceoverHiggsfieldToFile }
  : (useElevenLabs ? elevenLabs : edgeTts);
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

// ── GET /debug/jobs ── lista qué quedó guardado en disco de intentos anteriores,
// para poder recuperar clips ya pagados en vez de regenerarlos ──────────────
app.get("/debug/jobs", (req, res) => {
  try {
    const dirs = fs.readdirSync("outputs", { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => {
        const jobDir = path.join("outputs", d.name);
        const files = fs.readdirSync(jobDir).map(f => {
          const st = fs.statSync(path.join(jobDir, f));
          return { name: f, sizeKB: Math.round(st.size / 1024), mtime: st.mtime };
        });
        return { jobId: d.name, files };
      })
      .sort((a, b) => (b.files[0]?.mtime > a.files[0]?.mtime ? 1 : -1));
    res.json({ ok: true, jobs: dirs });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
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
  log(jobId, `[2/4] Generando voz (${voiceEngineName})...`);
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
  log(jobId, `[3/4] Generando ${N} clips (${useLTXVideo ? "LTX-Video gratis" : "Higgsfield Soul+DoP"}, ~${segDur.toFixed(1)}s c/u)...`);
  const clipUrls = await withTimeout(
    useLTXVideo
      ? generateAllClipsLTX(visualPrompts, segDur, msg => { log(jobId, msg); upd(jobId, { statusMsg: msg }); })
      : generateAllClips(visualPrompts, segDur, msg => { log(jobId, msg); upd(jobId, { statusMsg: msg }); }),
    Math.max(1500000, N * 400000), "Video clips timeout" // imagen+video por segmento, escala con N
  );
  // Nota: si LTX generó menos clips que segmentos del guion (tope de cuota gratis),
  // renderVideo.js ya recalcula segDur internamente a partir de clips.length, así
  // que cada clip se estira automáticamente para cubrir la duración total del audio.
  const clipFiles = [];
  for (let i = 0; i < clipUrls.length; i++) {
    const clip = clipUrls[i];
    const isImage = clip.type === "image";
    const dest = path.join(workDir, `clip${i + 1}${isImage ? ".jpg" : ".mp4"}`);
    await downloadFile(clip.url, dest);
    clipFiles.push({ path: dest, type: clip.type });
    log(jobId, `Clip ${i + 1}/${N} descargado${isImage ? " (imagen fija, DoP falló)" : ""}`);
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
  const url = String(err?.config?.url || "");
  const isElevenLabs = url.includes("elevenlabs.io");
  const isReplicate = url.includes("replicate.com");

  if (raw.includes("SIN CRÉDITO en Higgsfield")) return raw;
  if (raw.includes("ELEVENLABS_API_KEY") || raw.includes("ELEVENLABS_VOICE_ID")) return raw;
  if (isElevenLabs && (status === 401 || status === 402 || body.includes("quota") || body.includes("credit"))) {
    return `CLAVE/CRÉDITO DE ELEVENLABS INVÁLIDO (HTTP ${status}) — revisar ELEVENLABS_API_KEY/ELEVENLABS_VOICE_ID en Railway y el plan/créditos en elevenlabs.io. Detalle: ${body.slice(0, 200)}`;
  }
  if (isReplicate && status === 402) {
    return "SIN CRÉDITO en Replicate (voz) — recargar en replicate.com/account/billing y reintentar en unos minutos.";
  }
  if (status === 402 || body.includes("insufficient credit")) {
    return `SIN CRÉDITO (HTTP 402) en ${url || "proveedor desconocido"} — revisar billing del servicio correspondiente. Detalle: ${body.slice(0, 200)}`;
  }
  if (status === 401 || body.includes("unauthenticated") || body.includes("invalid api key")) {
    return `CLAVE API INVÁLIDA en ${url || "proveedor desconocido"} — revisar las variables de API en Railway. Detalle: ${body.slice(0, 200)}`;
  }
  if (status === 429) {
    return "LÍMITE DE VELOCIDAD del proveedor — esperar 2-3 minutos y volver a intentar.";
  }
  if (raw.includes("timeout") || raw.includes("Timeout")) {
    return "TIEMPO AGOTADO en un paso (" + raw + ") — volver a intentar; si se repite, avisar al administrador.";
  }
  // Cualquier otro error HTTP (ej. 400) sin caso específico: mostrar el detalle real
  // del proveedor en vez de solo "Request failed with status code X" a secas.
  if (status) {
    return `ERROR HTTP ${status} en ${url || "proveedor desconocido"} — Detalle: ${JSON.stringify(err?.response?.data || "").slice(0, 400)}`;
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
      voice: voiceEngineName,
      audio: "/download/test-voice.mp3",
      nota: "Abre el link 'audio' para escuchar la voz"
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: friendlyError(e) });
  }
});

// ── GET /test-voice-minimax ── prueba barata y aislada de la voz de MiniMax
// (API directa, no Replicate) — para saber qué voice_id hay guardado ────────
app.get("/test-voice-minimax", async (req, res) => {
  try {
    const minimax = require("./pipeline/minimax");
    const out = path.join("outputs", "test-voice-minimax.mp3");
    const url = await minimax.generateVoiceover("Hola, esta es una prueba de la voz vía MiniMax.");
    await downloadFile(url, out);
    res.json({ ok: true, audio: "/download/test-voice-minimax.mp3", voiceIdUsado: process.env.MINIMAX_VOICE_ID, nota: "Abre el link 'audio' y escucha si es Guillermo o una voz genérica" });
  } catch (e) {
    res.status(500).json({ ok: false, error: friendlyError(e) });
  }
});

// ── GET /test-voice-higgsfield ── prueba barata y aislada de la voz de Guillermo
// vía Higgsfield Cloud (1 frase corta), sin tocar el resto del pipeline ──────
app.get("/test-voice-higgsfield", async (req, res) => {
  try {
    const out = path.join("outputs", "test-voice-higgsfield.mp3");
    await generateVoiceoverHiggsfieldToFile("Hola, esta es una prueba de la voz de Guillermo vía Higgsfield.", out);
    res.json({ ok: true, audio: "/download/test-voice-higgsfield.mp3", nota: "Si suena bien, ya podemos usar esta voz en el pipeline principal" });
  } catch (e) {
    res.status(500).json({ ok: false, error: friendlyError(e) });
  }
});

// ── GET /test-pexels ── prueba gratis e ilimitada del respaldo de video de stock ──
app.get("/test-pexels", async (req, res) => {
  try {
    const url = await pexels.searchVideo(req.query.q || "server room data center");
    res.json({ ok: true, video: url, nota: "Video de stock real de Pexels — respaldo cuando LTX-Video falla" });
  } catch (e) {
    res.status(500).json({ ok: false, error: friendlyError(e) });
  }
});

// ── GET /test-image ── prueba barata de Higgsfield Cloud (1 imagen Soul) ─────
app.get("/test-image", async (req, res) => {
  try {
    const { generateImage } = require("./pipeline/higgsfieldCloud");
    const url = await generateImage("Low-angle shot of a glass and steel financial skyscraper photographed from the base looking up, lit by a single strong light source from the left casting hard shadows, cinematic lighting, high contrast black-and-white base with a single warm gold/amber accent light source, dark editorial financial-terminal aesthetic, sharp focus, powerful composition, 9:16 vertical, photorealistic, 8k, no text, no logos, no floating particles, no fog, no people");
    res.json({ ok: true, image: url, nota: "Si ves la imagen, las claves de Higgsfield Cloud funcionan" });
  } catch (e) {
    res.status(500).json({ ok: false, error: friendlyError(e) });
  }
});

// ── GET /test-clip ── prueba barata de UN clip completo (imagen Soul + animación
// DoP) para verificar calidad de video real antes de arriesgar un reel completo ──
app.get("/test-clip", async (req, res) => {
  try {
    const { generateImage, generateClipFromImage } = require("./pipeline/higgsfieldCloud");
    const imagePrompt = "Low-angle shot of a glass and steel financial skyscraper photographed from the base looking up, lit by a single strong light source from the left casting hard shadows, cinematic lighting, high contrast black-and-white base with a single warm gold/amber accent light source, dark editorial financial-terminal aesthetic, sharp focus, powerful composition, 9:16 vertical, photorealistic, 8k, no text, no logos, no floating particles, no fog, no people";
    const motionPrompt = "camera tilts up along the subject, amber light glints across the glass facade";
    const imageUrl = await generateImage(imagePrompt);
    const videoUrl = await generateClipFromImage(imageUrl, motionPrompt, 5);
    const out = path.join("outputs", "test-clip.mp4");
    await downloadFile(videoUrl, out);
    res.json({ ok: true, image: imageUrl, video: "/download/test-clip.mp4", nota: "Este es un clip real con la línea gráfica y animación final" });
  } catch (e) {
    res.status(500).json({ ok: false, error: friendlyError(e), detalle: e.response?.data || null });
  }
});

// ── GET /test-clip-ltx ── prueba barata (1 clip corto) del motor gratis LTX-Video
// vía Hugging Face Space — consume cuota diaria de ZeroGPU, usar con moderación ──
app.get("/test-clip-ltx", async (req, res) => {
  try {
    const url = await ltxSpace.generateClip(
      "Low-angle shot of a glass and steel financial skyscraper, cinematic lighting, gold accent light, 9:16 vertical, photorealistic",
      3
    );
    const out = path.join("outputs", "test-clip-ltx.mp4");
    await downloadFile(url, out);
    res.json({ ok: true, video: "/download/test-clip-ltx.mp4", nota: "Motor gratis LTX-Video (Hugging Face Space) funcionando" });
  } catch (e) {
    res.status(500).json({ ok: false, error: friendlyError(e) });
  }
});

app.listen(PORT, () => console.log(`Reel Generator → http://localhost:${PORT}`));
