const axios = require("axios");

// WAN 2.1 text-to-video via Replicate — alta calidad cinematográfica 9:16
async function generateClip(prompt) {
  const apiKey = process.env.REPLICATE_API_KEY;

  // Usar endpoint de modelo (sin version hash) para siempre tener la versión activa
  const { data: pred } = await axios.post(
    "https://api.replicate.com/v1/models/wavespeedai/wan-2.1-t2v-720p/predictions",
    {
      input: {
        prompt,
        aspect_ratio: "9:16"
      }
    },
    {
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      timeout: 30000
    }
  );

  const predId = pred.id;
  if (!predId) throw new Error("WAN 2.1: no prediction id — " + JSON.stringify(pred).slice(0, 200));
  return await waitForPrediction(predId, apiKey);
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
      if (!url) throw new Error("WAN 2.1: succeeded pero sin output");
      return url;
    }
    if (data.status === "failed") {
      throw new Error("WAN 2.1 falló: " + (data.error || JSON.stringify(data).slice(0, 200)));
    }
  }
  throw new Error("WAN 2.1 timeout");
}

async function generateAllClips(prompts, onProgress) {
  const urls = [];
  for (let i = 0; i < prompts.length; i++) {
    onProgress(`Generando clip ${i + 1} de ${prompts.length}...`);
    const url = await generateClipWithRetry(prompts[i]);
    urls.push(url);
    if (i < prompts.length - 1) await sleep(3000); // pausa entre clips
  }
  return urls;
}

async function generateClipWithRetry(prompt, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await generateClip(prompt);
    } catch (e) {
      const is429 = e.response?.status === 429 || (e.message && e.message.includes("429"));
      if (is429 && attempt < maxRetries) {
        const wait = attempt * 15000; // 15s, 30s
        console.log(`Rate limit 429 — esperando ${wait/1000}s antes de reintentar...`);
        await sleep(wait);
      } else {
        throw e;
      }
    }
  }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

module.exports = { generateAllClips };
