const { spawn } = require("child_process");
const ffmpegPath = require("ffmpeg-static");
const fs = require("fs");

async function renderVideo({ clips, audioFile, captions, duration, outPath }) {
  const N = clips.length;
  const w = 1080, h = 1920;

  const inputs = [];
  clips.forEach(c => inputs.push("-i", c));
  inputs.push("-i", audioFile);

  // Scale each clip to 1080x1920
  let filter = "";
  for (let i = 0; i < N; i++) {
    filter += `[${i}:v]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},setsar=1,fps=30[v${i}];`;
  }

  // Concat (universally supported, no xfade version dependency)
  const vIn = Array.from({ length: N }, (_, i) => `[v${i}]`).join("");
  filter += `${vIn}concat=n=${N}:v=1:a=0[vout]`;

  const args = [
    "-y",
    ...inputs,
    "-filter_complex", filter,
    "-map", "[vout]",
    "-map", `${N}:a`,
    "-c:v", "libx264",
    "-crf", "23",
    "-preset", "fast",
    "-pix_fmt", "yuv420p",
    "-c:a", "aac",
    "-b:a", "192k",
    "-shortest",
    outPath
  ];

  return new Promise((resolve, reject) => {
    const ff = spawn(ffmpegPath, args);
    let stderr = "";
    ff.stderr.on("data", d => { stderr += d.toString(); });
    ff.on("close", code => {
      if (code === 0) resolve(outPath);
      else reject(new Error("ffmpeg failed:\n" + stderr.slice(-1500)));
    });
  });
}

module.exports = { renderVideo };
