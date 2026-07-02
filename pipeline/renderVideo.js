const { spawn } = require("child_process");
const ffmpegPath = require("ffmpeg-static");
const fs = require("fs");
const path = require("path");

const FONT = path.resolve(__dirname, "..", "fonts", "bold.ttf").replace(/\\/g, "/");

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

// Sanitiza texto para drawtext: sin comillas simples, dos puntos ni backslash
function safeText(text) {
  return (text || "")
    .replace(/\*\*/g, "")
    .replace(/\\/g, "")
    .replace(/'/g, "’")
    .replace(/:/g, "∶")
    .replace(/%/g, " pct")
    .replace(/\n/g, " ")
    .trim()
    .substring(0, 90);
}

// Divide el caption en 2 líneas balanceadas para que no se salga del frame
function twoLines(text) {
  const words = text.split(" ");
  if (text.length < 34) return [text];
  let best = 0, bestDiff = Infinity;
  let len = 0;
  for (let i = 0; i < words.length - 1; i++) {
    len += words[i].length + 1;
    const diff = Math.abs(len - (text.length - len));
    if (diff < bestDiff) { bestDiff = diff; best = i; }
  }
  return [words.slice(0, best + 1).join(" "), words.slice(best + 1).join(" ")];
}

async function renderVideo({ clips, audioFile, captions, duration, outPath }) {
  const N = clips.length;
  const segDur = Math.max(3, duration / N);
  const workDir = path.dirname(clips[0]);
  const w = 720, h = 1280;
  const fade = 0.35;

  // 1. Procesar cada clip: recorte, escala, fade in/out, caption propio
  const parts = [];
  for (let i = 0; i < N; i++) {
    const part = path.join(workDir, `part${i}.mp4`);
    const lines = twoLines(safeText(captions[i]));

    let vf = `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},setsar=1,fps=30,format=yuv420p`;
    // Fade in y out por clip = transición profesional entre segmentos
    vf += `,fade=t=in:st=0:d=${fade},fade=t=out:st=${(segDur - fade).toFixed(2)}:d=${fade}`;
    // Captions centrados abajo, caja semitransparente, 1-2 líneas
    const baseY = lines.length === 2 ? "h*0.70" : "h*0.73";
    lines.forEach((line, li) => {
      const y = `${baseY}+${li}*64`;
      vf += `,drawtext=fontfile='${FONT}':text='${line}':fontsize=44:fontcolor=white:borderw=3:bordercolor=black@0.85:x=(w-text_w)/2:y=${y}`;
    });

    await run([
      "-y", "-i", clips[i],
      "-t", segDur.toFixed(2),
      "-vf", vf,
      "-an",
      "-c:v", "libx264", "-preset", "ultrafast", "-crf", "24",
      part
    ], `clip ${i + 1}`);
    parts.push(part);
  }

  // 2. Concat demuxer (stream copy, sin memoria)
  const listFile = path.join(workDir, "list.txt");
  fs.writeFileSync(listFile, parts.map(p => `file '${path.resolve(p).replace(/\\/g, "/")}'`).join("\n"));
  const joined = path.join(workDir, "joined.mp4");
  await run(["-y", "-f", "concat", "-safe", "0", "-i", listFile, "-c", "copy", joined], "concat");

  // 3. Mux con la voz de Guillermo
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
