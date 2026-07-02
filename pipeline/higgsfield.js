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

// Usa ffmpeg directamente (no ffprobe, que puede no existir en el contenedor de
// Railway y antes caía en un fallback fijo de 38s — cortando el video en seco si
// la narración real era más larga).
function resolveFfmpegPath() {
  const { execSync } = require("child_process");
  try {
    execSync("ffmpeg -version", { stdio: "ignore" });
    return "ffmpeg";
  } catch {
    return require("ffmpeg-static");
  }
}

async function getAudioDuration(filePath) {
  const { spawnSync } = require("child_process");
  const ffmpegPath = resolveFfmpegPath();
  const result = spawnSync(ffmpegPath, ["-i", filePath, "-f", "null", "-"], { encoding: "utf8", timeout: 15000 });
  const stderr = (result.stderr || "") + (result.stdout || "");
  const match = stderr.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/);
  if (match) {
    const [, hh, mm, ss] = match;
    const seconds = (+hh) * 3600 + (+mm) * 60 + parseFloat(ss);
    if (seconds > 0) return Math.ceil(seconds);
  }
  console.log("getAudioDuration: no se pudo leer duración real, usando fallback 38s — REVISAR", stderr.slice(-300));
  return 38;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

module.exports = { generateAllClips, generateVoiceover, downloadFile, getAudioDuration };
