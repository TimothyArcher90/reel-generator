const { spawn } = require("child_process");
const ffmpegPath = require("ffmpeg-static");
const fs   = require("fs");
const path = require("path");

// ── Render MP4 with ffmpeg ────────────────────────────────────────────────────
// clips: array of local file paths
// audioFile: local path to MP3
// captions: array of strings (one per clip)
// duration: total seconds
// outPath: output MP4 path
async function renderVideo({ clips, audioFile, captions, duration, outPath }) {
  const N        = clips.length;
  const segDur   = duration / N;
  const fade     = 0.5;
  const w        = 1080;
  const h        = 1920;
  const fontFile = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";

  // Build ffmpeg args
  // Inputs: all clips + audio
  const inputs = [];
  clips.forEach(c => { inputs.push("-i", c); });
  inputs.push("-i", audioFile);

  // Filter complex: scale each clip, xfade between them, drawtext captions
  let filter = "";

  // Scale all clips to 1080x1920
  for (let i = 0; i < N; i++) {
    filter += `[${i}:v]scale=${w}:${h}:force_original_aspect_ratio=increase,` +
              `crop=${w}:${h},setsar=1,fps=30[v${i}];`;
  }

  // Chain xfade transitions
  if (N === 1) {
    filter += `[v0]copy[vout];`;
  } else {
    let offset = segDur - fade;
    filter += `[v0][v1]xfade=transition=fade:duration=${fade}:offset=${offset.toFixed(2)}[xf1];`;
    for (let i = 2; i < N; i++) {
      offset += segDur - fade;
      const prev = i === 2 ? "xf1" : `xf${i - 1}`;
      filter += `[${prev}][v${i}]xfade=transition=fade:duration=${fade}:offset=${offset.toFixed(2)}[xf${i}];`;
    }
    const lastXf = N === 2 ? "xf1" : `xf${N - 1}`;
    filter += `[${lastXf}]copy[vout];`;
  }

  // Drawtext captions (one per segment, centered lower third)
  let captionFilter = "[vout]";
  captions.forEach((text, i) => {
    const start = i * segDur + 0.4;
    const end   = (i + 1) * segDur - 0.4;
    const safe  = text
      .replace(/\\/g, "")
      .replace(/’/g, "’")
      .replace(/’/g, "’")
      .replace(/:/g, "∶")
      .replace(/\[/g, "(")
      .replace(/\]/g, ")")
      .replace(/\*/g, "")
      .replace(/"/g, "”")
      .replace(/\n/g, " ")
      .trim()
      .substring(0, 100);
    captionFilter +=
      `drawtext=text='${safe}':` +
      `fontsize=52:fontcolor=white:` +
      `x=(w-text_w)/2:y=h*0.72:` +
      `box=1:boxcolor=black@0.45:boxborderw=12:` +
      `enable='between(t,${start.toFixed(2)},${end.toFixed(2)})':` +
      `line_spacing=8,`;
  });
  // remove trailing comma and close
  captionFilter = captionFilter.replace(/,$/, "") + "[final]";
  filter += captionFilter;

  const audioIndex = N;
  const args = [
    "-y",
    ...inputs,
    "-filter_complex", filter,
    "-map", "[final]",
    "-map", `${audioIndex}:a`,
    "-c:v", "libx264",
    "-crf", "18",
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
      else reject(new Error("ffmpeg failed:\n" + stderr.slice(-2000)));
    });
  });
}

module.exports = { renderVideo };
