const axios = require("axios");

// Uses Replicate (same account/key as voice) for video generation
// Model: wavespeedai/wan-2.1-t2v-720p — fast, cinematic, 9:16 support
const MODEL = "wavespeedai/wan-2.1-t2v-720p";

async function generateClip(prompt) {
  const apiKey = process.env.REPLICATE_API_KEY;

  const { data: pred } = await axios.post(
    `https://api.replicate.com/v1/models/${MODEL}/predictions`,
    {
      input: {
        prompt,
        aspect_ratio: "9:16",
        num_frames:   81,
        sample_steps: 30,
        sample_guide_scale: 6
      }
    },
    {
      headers: {
        Authorization:  `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      timeout: 30000
    }
  );

  const predId = pred.id;
  if (!predId) throw new Error("Replicate video: no prediction id — " + JSON.stringify(pred).slice(0, 200));
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
      if (!url) throw new Error("Replicate video: succeeded pero sin output");
      return url;
    }
    if (data.status === "failed") {
      throw new Error("Replicate video falló: " + (data.error || JSON.stringify(data).slice(0, 200)));
    }
  }
  throw new Error("Replicate video timeout");
}

async function generateAllClips(prompts, onProgress) {
  const urls  = [];
  const batch = 2; // 2 en paralelo para no agotar créditos rápido
  for (let i = 0; i < prompts.length; i += batch) {
    const slice = prompts.slice(i, i + batch);
    onProgress(`Generando clips ${i + 1}-${Math.min(i + batch, prompts.length)} de ${prompts.length}...`);
    const batchUrls = await Promise.all(slice.map(p => generateClip(p)));
    urls.push(...batchUrls);
  }
  return urls;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

module.exports = { generateAllClips };
