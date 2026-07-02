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

// Secuencial: el paralelo (incluso escalonado 4s) sigue chocando con el rate
// limit de Replicate en esta cuenta. Confiabilidad > velocidad — cada clip tarda
// 3-4 min, así que un reel de 6-8 clips toma ~25-30 min, corriendo solo sin que
// nadie tenga que estar pendiente de la pantalla.
async function generateAllClips(prompts, segDurSeconds, onProgress) {
  const urls = [];
  for (let i = 0; i < prompts.length; i++) {
    onProgress(`Generando clip ${i + 1} de ${prompts.length} (Seedance Pro)...`);
    urls.push(await generateClipWithRetry(prompts[i], segDurSeconds));
    if (i < prompts.length - 1) await sleep(3000);
  }
  return urls;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

module.exports = { generateAllClips };
