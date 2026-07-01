const axios = require("axios");

const BASE = "https://api.runwayml.com/v1";
const KEY  = () => process.env.RUNWAY_API_KEY;

const rw = () => axios.create({
  baseURL: BASE,
  headers: {
    Authorization:     `Bearer ${KEY()}`,
    "X-Runway-Version": "2024-11-06",
    "Content-Type":     "application/json"
  },
  timeout: 60000
});

async function generateClip(prompt) {
  const { data } = await rw().post("/tasks", {
    taskType: "text_to_video",
    model:    "gen4_turbo",
    parameters: {
      promptText:  prompt,
      duration:    5,
      ratio:       "720:1280"
    }
  });

  const taskId = data.id;
  if (!taskId) throw new Error("Runway: no taskId en respuesta: " + JSON.stringify(data).slice(0, 200));
  return await waitForTask(taskId);
}

async function waitForTask(taskId, timeoutMs = 300000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await sleep(5000);
    const { data } = await rw().get(`/tasks/${taskId}`);
    if (data.status === "SUCCEEDED") {
      const url = Array.isArray(data.output) ? data.output[0] : data.output;
      if (!url) throw new Error("Runway: SUCCEEDED pero sin output");
      return url;
    }
    if (data.status === "FAILED") throw new Error(`Runway task falló: ${data.failure || JSON.stringify(data)}`);
  }
  throw new Error(`Runway task ${taskId} timeout`);
}

async function generateAllClips(prompts, onProgress) {
  const urls  = [];
  const batch = 3;
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
