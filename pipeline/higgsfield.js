const axios = require("axios");
const fs    = require("fs");

const BASE = "https://api.higgsfield.ai/v1";
const KEY  = () => process.env.HIGGSFIELD_API_KEY;

const hf = () => axios.create({
  baseURL: BASE,
  headers: { Authorization: `Bearer ${KEY()}` },
  timeout: 30000
});

async function waitForJob(jobId, intervalMs = 5000, timeoutMs = 300000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await sleep(intervalMs);
    const { data } = await hf().get(`/generation/${jobId}`);
    const job = data.results?.[0] ?? data;
    if (job.status === "completed" || job.status === "succeeded") return job;
    if (job.status === "failed") throw new Error(`Job ${jobId} failed: ${job.error || ""}`);
  }
  throw new Error(`Job ${jobId} timed out`);
}

async function generateClip(prompt) {
  const { data } = await hf().post("/generation", {
    model:        "cinematic_studio_video_v2",
    prompt,
    aspect_ratio: "9:16",
    duration:     8,
    sound:        "off",
    genre:        "spectacle",
    cfg_scale:    0.7,
    mode:         "std"
  });
  const jobId = data.results?.[0]?.id ?? data.id;
  const job   = await waitForJob(jobId);
  return job.results?.rawUrl ?? job.rawUrl ?? job.url;
}

async function generateAllClips(prompts, onProgress) {
  const urls  = [];
  const batch = 4;
  for (let i = 0; i < prompts.length; i += batch) {
    const slice = prompts.slice(i, i + batch);
    onProgress(`Generando clips ${i + 1}-${Math.min(i + batch, prompts.length)} de ${prompts.length}...`);
    const batchUrls = await Promise.all(slice.map(p => generateClip(p)));
    urls.push(...batchUrls);
  }
  return urls;
}

async function generateVoiceover(text) {
  const voiceId = process.env.HIGGSFIELD_VOICE_ID;
  const { data } = await hf().post("/generation", {
    model:      "seed_audio",
    prompt:     text,
    voice_id:   voiceId,
    voice_type: "element"
  });
  const jobId = data.results?.[0]?.id ?? data.id;
  const job   = await waitForJob(jobId);
  return job.results?.rawUrl ?? job.rawUrl ?? job.url;
}

async function downloadFile(url, dest) {
  const response = await axios.get(url, { responseType: "stream", timeout: 120000 });
  const writer   = fs.createWriteStream(dest);
  response.data.pipe(writer);
  return new Promise((resolve, reject) => {
    writer.on("finish", resolve);
    writer.on("error",  reject);
  });
}

async function getAudioDuration(filePath) {
  try {
    const { execSync } = require("child_process");
    const out = execSync(
      `ffprobe -v quiet -print_format json -show_streams "${filePath}"`,
      { encoding: "utf8", timeout: 10000 }
    );
    const streams = JSON.parse(out).streams;
    return Math.ceil(parseFloat(streams[0].duration));
  } catch {
    return 38;
  }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

module.exports = { generateAllClips, generateVoiceover, downloadFile, getAudioDuration };
