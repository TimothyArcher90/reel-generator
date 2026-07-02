const { spawn, execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

// Preferir ffmpeg del sistema (nixpacks); fallback a ffmpeg-static
let ffmpegPath;
try {
  execSync("ffmpeg -version", { stdio: "ignore" });
  ffmpegPath = "ffmpeg";
} catch {
  ffmpegPath = require("ffmpeg-static");
}

// Verificar soporte real de drawtext (requiere libfreetype) — si no está, seguimos sin captions
let HAS_DRAWTEXT = false;
try {
  const filters = execSync(`"${ffmpegPath}" -filters`, { encoding: "utf8", timeout: 10000 });
  HAS_DRAWTEXT = /drawtext/.test(filters);
} catch { HAS_DRAWTEXT = false; }
console.log("ffmpeg en uso:", ffmpegPath, "| drawtext:", HAS_DRAWTEXT);

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
  const trans = 0.5; // duración del crossfade entre clips

  // 1. Procesar cada clip: recorte exacto a segDur, escala, caption propio (sin fade — el
  //    crossfade entre clips lo hace xfade en el paso 2)
  const parts = [];
  for (let i = 0; i < N; i++) {
    const part = path.join(workDir, `part${i}.mp4`);
    const lines = twoLines(safeText(captions[i]));

    let vf = `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},setsar=1,fps=30,format=yuv420p`;
    if (HAS_DRAWTEXT) {
      const baseY = lines.length === 2 ? "h*0.70" : "h*0.73";
      lines.forEach((line, li) => {
        const y = `${baseY}+${li}*64`;
        vf += `,drawtext=fontfile='${FONT}':text='${line}':fontsize=44:fontcolor=white:borderw=3:bordercolor=black@0.85:x=(w-text_w)/2:y=${y}`;
      });
    }

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

  // 2. Unir con crossfade real (xfade), de a pares consecutivos — bajo consumo de
  //    memoria porque solo decodifica 2 clips (ya livianos) a la vez, en vez de los
  //    N clips originales en un solo filtro gigante (eso provocaba OOM en Railway).
  let acc = parts[0];
  let accDur = segDur;
  for (let i = 1; i < N; i++) {
    const offset = Math.max(0, accDur - trans);
    const merged = path.join(workDir, `merge${i}.mp4`);
    await run([
      "-y", "-i", acc, "-i", parts[i],
      "-filter_complex", `[0:v][1:v]xfade=transition=fade:duration=${trans}:offset=${offset.toFixed(2)}[v]`,
      "-map", "[v]",
      "-c:v", "libx264", "-preset", "ultrafast", "-crf", "24",
      merged
    ], `xfade ${i}`);
    acc = merged;
    accDur = accDur + segDur - trans;
  }

  // 3. Cierre: fade-to-black suave sobre el video ya unido, para que termine con
  //    intención en vez de cortarse en seco.
  const closeFade = 0.6;
  const faded = path.join(workDir, "faded.mp4");
  await run([
    "-y", "-i", acc,
    "-vf", `fade=t=out:st=${Math.max(0, accDur - closeFade).toFixed(2)}:d=${closeFade}`,
    "-c:v", "libx264", "-preset", "ultrafast", "-crf", "24",
    faded
  ], "cierre fade-to-black");

  // 4. Mux con la voz de Guillermo
  await run([
    "-y", "-i", faded, "-i", audioFile,
    "-map", "0:v", "-map", "1:a",
    "-c:v", "copy",
    "-c:a", "aac", "-ar", "44100", "-b:a", "128k",
    "-shortest",
    outPath
  ], "mux audio");

  return outPath;
}

module.exports = { renderVideo };
