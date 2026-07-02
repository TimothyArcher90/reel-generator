const { spawn } = require("child_process");
const ffmpegPath = require("ffmpeg-static");
const fs = require("fs");
const path = require("path");

function run(args, label) {
  return new Promise((resolve, reject) => {
    const ff = spawn(ffmpegPath, args);
    let stderr = "";
    ff.stderr.on("data", d => { stderr += d.toString(); });
    ff.on("error", reject);
    ff.on("close", code => {
      if (code === 0) resolve();
      else reject(new Error(`${label} failed (code ${code}): ` + stderr.slice(-800)));
    });
  });
}

// Procesa clip por clip (bajo uso de memoria) y une con concat demuxer.
async function renderVideo({ clips, audioFile, captions, duration, outPath }) {
  const N = clips.length;
  const segDur = Math.max(3, duration / N);
  const workDir = path.dirname(clips[0]);
  const w = 720, h = 1280; // 720p vertical: mucho más liviano en Railway

  // 1. Normalizar cada clip: recortar a segDur, escalar, mismo codec/fps
  const parts = [];
  for (let i = 0; i < N; i++) {
    const part = path.join(workDir, `part${i}.mp4`);
    await run([
      "-y", "-i", clips[i],
      "-t", segDur.toFixed(2),
      "-vf", `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},setsar=1,fps=30,format=yuv420p`,
      "-an",
      "-c:v", "libx264", "-preset", "ultrafast", "-crf", "26",
      part
    ], `clip ${i + 1}`);
    parts.push(part);
  }

  // 2. Concat demuxer (stream copy — sin re-encode, sin memoria)
  const listFile = path.join(workDir, "list.txt");
  fs.writeFileSync(listFile, parts.map(p => `file '${path.resolve(p)}'`).join("\n"));
  const joined = path.join(workDir, "joined.mp4");
  await run([
    "-y", "-f", "concat", "-safe", "0", "-i", listFile,
    "-c", "copy", joined
  ], "concat");

  // 3. Agregar audio
  await run([
    "-y", "-i", joined, "-i", audioFile,
    "-map", "0:v", "-map", "1:a",
    "-c:v", "copy",
    "-c:a", "aac", "-ar", "44100", "-b:a", "128k",
    "-shortest",
    outPath
  ], "mux audio");

  return outPath;
}

module.exports = { renderVideo };
