const axios = require("axios");

// Video AI de alta calidad via Replicate — modelo de comunidad (no requiere tarjeta extra)
const PRIMARY = "fofr/ltx-video";

async function createPrediction(model, input, apiKey) {
  const { data } = await axios.post(
    `https://api.replicate.com/v1/models/${model}/predictions`,
    { input },
    { headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, timeout: 30000 }
  );
  if (!data.id) throw new Error(model + ": no prediction id — " + JSON.stringify(data).slice(0, 200));
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

async function generateClip(prompt) {
  const apiKey = process.env.REPLICATE_API_KEY;

  const id = await createPrediction(PRIMARY, {
    prompt,
    aspect_ratio: "9:16",
    length:       97,   // ~4s a 24fps
    target_size:  640,
    steps:        30
  }, apiKey);
  return await waitForPrediction(id, apiKey);
}

async function generateClipWithRetry(prompt, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await generateClip(prompt);
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

async function generateAllClips(prompts, onProgress) {
  const urls = [];
  for (let i = 0; i < prompts.length; i++) {
    onProgress(`Generando clip AI ${i + 1} de ${prompts.length} (LTX-Video)...`);
    urls.push(await generateClipWithRetry(prompts[i]));
    if (i < prompts.length - 1) await sleep(2000);
  }
  return urls;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

module.exports = { generateAllClips };
