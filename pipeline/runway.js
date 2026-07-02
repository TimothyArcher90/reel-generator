const axios = require("axios");

// Video AI premium — Kling v1.6 Standard via Replicate. Elegido específicamente por
// su fuerte adherencia al prompt (cfg_scale alto = sigue el texto de forma literal),
// que era la causa real de que el video no tuviera relación con el guion en modelos
// anteriores (LTX-video, Seedance-lite). Requiere tarjeta débito/crédito en Replicate.
const VERSION = "e6f571e8d6990da3c96abf8d3082894024d652822f0ca3cd244acece84a1cc3e";
const ALLOWED_DURATIONS = [5, 10]; // únicos valores que acepta Kling

function pickDuration(segDurSeconds) {
  return ALLOWED_DURATIONS.find(d => d >= segDurSeconds) || ALLOWED_DURATIONS[ALLOWED_DURATIONS.length - 1];
}

async function createPrediction(input, apiKey) {
  const { data } = await axios.post(
    "https://api.replicate.com/v1/predictions",
    { version: VERSION, input },
    { headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, timeout: 30000 }
  );
  if (!data.id) throw new Error("Kling: no prediction id — " + JSON.stringify(data).slice(0, 200));
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

  const id = await createPrediction({
    prompt,
    duration:     pickDuration(segDurSeconds),
    aspect_ratio: "9:16",
    cfg_scale:    0.8 // alto = mayor fidelidad al prompt, menos libertad creativa
  }, apiKey);
  return await waitForPrediction(id, apiKey);
}

async function generateClipWithRetry(prompt, segDurSeconds, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await generateClip(prompt, segDurSeconds);
    } catch (e) {
      const is429 = e.response?.status === 429 || (e.message && e.message.includes("429"));
      if (is429 && attempt < maxRetries) {
        await sleep(attempt * 15000);
      } else if (attempt < maxRetries) {
        await sleep(5000);
      } else {
        throw e;
      }
    }
  }
}

async function generateAllClips(prompts, segDurSeconds, onProgress) {
  const urls = [];
  for (let i = 0; i < prompts.length; i++) {
    onProgress(`Generando clip AI ${i + 1} de ${prompts.length} (Kling)...`);
    urls.push(await generateClipWithRetry(prompts[i], segDurSeconds));
    if (i < prompts.length - 1) await sleep(2000);
  }
  return urls;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

module.exports = { generateAllClips };
