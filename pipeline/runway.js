const axios = require("axios");

// Video AI premium — ByteDance Seedance 1 Pro via Replicate. Rápido y confiable
// (confirmado con prueba real), tier superior a seedance-1-lite. Kling se descartó
// por quedarse atascado 18+ min en una prueba real sin completar.
const VERSION = "a5fd550893da3b6f67997812759065652454ddaca10e96b83b59cbae1814cb36";

async function createPrediction(input, apiKey) {
  const { data } = await axios.post(
    "https://api.replicate.com/v1/predictions",
    { version: VERSION, input },
    { headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, timeout: 30000 }
  );
  if (!data.id) throw new Error("Seedance: no prediction id — " + JSON.stringify(data).slice(0, 200));
  return data.id;
}

async function waitForPrediction(predId, apiKey, timeoutMs = 600000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await sleep(6000);
    const { data } = await axios.get(
      `https://api.replicate.com/v1/predictions/${predId}`,
      { headers: { Authorization: `Bearer ${apiKey}` }, timeout: 15000 }
    );
    if (data.status === "succeeded") {
      const url = Array.isArray(data.output) ? data.output[0] : data.output;
      if (!url) throw new Error("succeeded pero sin output");
      return url;
    }
    if (data.status === "failed" || data.status === "canceled") {
      throw new Error("falló: " + (data.error || data.status));
    }
  }
  throw new Error("timeout");
}

async function generateClip(prompt, segDurSeconds) {
  const apiKey = process.env.REPLICATE_API_KEY;
  const duration = Math.min(12, Math.max(4, Math.ceil(segDurSeconds)));

  const id = await createPrediction({
    prompt,
    duration,
    resolution:   "720p",
    aspect_ratio: "9:16",
    camera_fixed: false
  }, apiKey);
  return await waitForPrediction(id, apiKey);
}

async function generateClipWithRetry(prompt, segDurSeconds, maxRetries = 5) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await generateClip(prompt, segDurSeconds);
    } catch (e) {
      const is429 = e.response?.status === 429 || (e.message && e.message.includes("429"));
      if (attempt >= maxRetries) throw e;
      const jitter = Math.random() * 3000;
      await sleep((is429 ? attempt * 20000 : 5000) + jitter);
    }
  }
}

// Genera en lotes de 3, escalonando el inicio de cada request dentro del lote
// (en vez de dispararlas todas al mismo milisegundo) para no saturar el rate
// limit de Replicate — eso era lo que causaba 429 incluso con retry.
async function generateAllClips(prompts, segDurSeconds, onProgress) {
  const BATCH   = 3;
  const STAGGER = 4000; // ms entre el inicio de cada request dentro del lote
  const urls = [];
  for (let i = 0; i < prompts.length; i += BATCH) {
    const slice = prompts.slice(i, i + BATCH);
    onProgress(`Generando clips ${i + 1}-${Math.min(i + BATCH, prompts.length)} de ${prompts.length} (Seedance Pro)...`);
    const batchUrls = await Promise.all(slice.map(async (p, idx) => {
      if (idx > 0) await sleep(idx * STAGGER);
      return generateClipWithRetry(p, segDurSeconds);
    }));
    urls.push(...batchUrls);
  }
  return urls;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

module.exports = { generateAllClips };
