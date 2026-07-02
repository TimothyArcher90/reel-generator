const axios = require("axios");

// Video AI premium — ByteDance Seedance 1 Lite via Replicate. Calidad muy superior
// a los modelos de comunidad gratuitos; requiere tarjeta débito/crédito en Replicate
// (modelo "partner oficial", igual que la voz de Guillermo en MiniMax).
const VERSION = "6e47dd83529ee0599c68f274f225635080e4fd218360a85e2a3a78396d388b73";

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
    resolution:    "720p",
    aspect_ratio:  "9:16",
    camera_fixed:  false
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

// segDurSeconds: duración estimada por segmento (audioDuration / N), para que cada
// clip generado dure al menos lo mismo que su tramo de audio correspondiente.
async function generateAllClips(prompts, segDurSeconds, onProgress) {
  const urls = [];
  for (let i = 0; i < prompts.length; i++) {
    onProgress(`Generando clip AI ${i + 1} de ${prompts.length} (Seedance)...`);
    urls.push(await generateClipWithRetry(prompts[i], segDurSeconds));
    if (i < prompts.length - 1) await sleep(2000);
  }
  return urls;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

module.exports = { generateAllClips };
