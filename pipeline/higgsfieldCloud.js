const axios = require("axios");

// Higgsfield Cloud API (platform.higgsfield.ai) — API REST oficial.
// Flujo por segmento: texto → imagen (Soul) → video (DoP image-to-video).
// Es el mismo motor con el que se hizo el reel de referencia de Spinoza.
const BASE = "https://platform.higgsfield.ai";
const IMAGE_MODEL = "higgsfield-ai/soul/standard";
const VIDEO_MODEL = "higgsfield-ai/dop/preview";
// Confirmado vía models_explore (MCP de Higgsfield): id real "text2speech_v2",
// requiere variant (motor), voice_type, voice_id. Ruta REST aún no confirmada
// contra la API real — verificar con GET /test-voice-higgsfield antes de un reel real.
const TTS_MODEL = "higgsfield-ai/text2speech_v2";
const TTS_VARIANT = "elevenlabs"; // motor bajo el cual probablemente se clonó la voz
const GUILLERMO_VOICE_ID = "6f4d5e1b-cd31-484a-8aff-0c8ee3e19d2b"; // "Guillermo-Voice-Clone"

function authHeader() {
  const key    = process.env.HF_CLOUD_KEY;
  const secret = process.env.HF_CLOUD_SECRET;
  if (!key || !secret) throw new Error("Faltan HF_CLOUD_KEY / HF_CLOUD_SECRET en las variables de Railway");
  return { Authorization: `Key ${key}:${secret}`, "Content-Type": "application/json" };
}

async function submit(modelId, body) {
  const { data } = await axios.post(`${BASE}/${modelId}`, body, { headers: authHeader(), timeout: 30000 });
  const requestId = data.request_id || data.id;
  if (!requestId) throw new Error(`Higgsfield ${modelId}: sin request_id — ` + JSON.stringify(data).slice(0, 300));
  return requestId;
}

async function waitForResult(requestId, timeoutMs = 600000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await sleep(6000);
    const { data } = await axios.get(`${BASE}/requests/${requestId}/status`, { headers: authHeader(), timeout: 15000 });
    const status = (data.status || "").toLowerCase();
    if (status === "completed" || status === "succeeded" || status === "success") {
      // El campo del resultado puede variar; cubrir las formas comunes
      const url = data.result?.url || data.result?.video?.url || data.result?.image?.url
        || data.output?.url || data.url
        || (Array.isArray(data.result) ? (data.result[0]?.url || data.result[0]) : null)
        || (Array.isArray(data.output) ? (data.output[0]?.url || data.output[0]) : null)
        || (Array.isArray(data.results) ? (data.results[0]?.url || data.results[0]?.raw?.url) : null)
        || (Array.isArray(data.images) ? data.images[0]?.url : null)
        || (Array.isArray(data.videos) ? data.videos[0]?.url : null);
      if (!url) throw new Error("NO_REINTENTAR: Higgsfield completado pero sin URL reconocible — " + JSON.stringify(data).slice(0, 400));
      return url;
    }
    if (status === "failed" || status === "nsfw" || status === "canceled") {
      throw new Error(`Higgsfield ${status}: ` + (data.error || JSON.stringify(data).slice(0, 200)));
    }
  }
  throw new Error("Higgsfield timeout");
}

async function generateImage(prompt) {
  const id = await submit(IMAGE_MODEL, {
    prompt,
    aspect_ratio: "9:16",
    resolution:   "720p"
  });
  return waitForResult(id);
}

async function generateClipFromImage(imageUrl, motionPrompt, durationSeconds) {
  const id = await submit(VIDEO_MODEL, {
    image_url: imageUrl,
    prompt:    motionPrompt,
    duration:  Math.min(10, Math.max(3, Math.round(durationSeconds)))
  });
  return waitForResult(id);
}

async function generateVoiceoverHiggsfield(text, voiceId = GUILLERMO_VOICE_ID) {
  const id = await submit(TTS_MODEL, {
    variant:    TTS_VARIANT,
    prompt:     text,
    voice_id:   voiceId,
    voice_type: "element"
  });
  return waitForResult(id);
}

function isCreditError(e) {
  const s = e.response?.status;
  const body = JSON.stringify(e.response?.data || "").toLowerCase();
  return s === 402 || body.includes("credit") || body.includes("insufficient") || body.includes("balance");
}

async function withRetry(fn, label, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (isCreditError(e)) {
        throw new Error("SIN CRÉDITO en Higgsfield Cloud — recargar en cloud.higgsfield.ai (" + label + ")");
      }
      // Errores de parseo (respuesta ya cobrada y completada, pero con forma no reconocida)
      // son deterministas: reintentar solo vuelve a cobrar el mismo clip sin arreglar nada.
      if (String(e.message || "").startsWith("NO_REINTENTAR:")) throw e;
      if (attempt >= maxRetries) throw e;
      await sleep(attempt * 8000 + Math.random() * 3000);
    }
  }
}

// prompts: array de { image, motion } — o strings (se usa el mismo texto para ambos pasos)
async function generateAllClips(prompts, segDurSeconds, onProgress) {
  const urls = [];
  for (let i = 0; i < prompts.length; i++) {
    const p = prompts[i];
    const imagePrompt  = typeof p === "string" ? p : p.image;
    const motionPrompt = typeof p === "string" ? "slow cinematic camera movement" : p.motion;

    onProgress(`Clip ${i + 1}/${prompts.length}: generando imagen base (Soul)...`);
    const imageUrl = await withRetry(() => generateImage(imagePrompt), `imagen ${i + 1}`);

    onProgress(`Clip ${i + 1}/${prompts.length}: animando con DoP...`);
    const videoUrl = await withRetry(() => generateClipFromImage(imageUrl, motionPrompt, segDurSeconds), `video ${i + 1}`);

    urls.push(videoUrl);
    if (i < prompts.length - 1) await sleep(2000);
  }
  return urls;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

module.exports = { generateAllClips, generateImage, generateClipFromImage, generateVoiceoverHiggsfield, GUILLERMO_VOICE_ID };
