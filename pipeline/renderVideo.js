const { spawn, execSync } = require("child_process");
const path = require("path");

// Preferir ffmpeg del sistema (nixpacks); fallback a ffmpeg-static
let ffmpegPath;
try {
  execSync("ffmpeg -version", { stdio: "ignore" });
  ffmpegPath = "ffmpeg";
} catch {
  ffmpegPath = require("ffmpeg-static");
}
console.log("ffmpeg en uso:", ffmpegPath);

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

async function renderVideo({ clips, audioFile, duration, outPath }) {
  const N = clips.length;
  const segDur = Math.max(3, duration / N);
  const workDir = path.dirname(clips[0]);
  const w = 720, h = 1280;
  const trans = 0.5;          // duración del crossfade entre clips
  const tailAfterVoice = 4;   // segundos de video que siguen después de terminar la narración

  // 1. Procesar cada clip: recorte exacto a segDur, escala — sin subtítulos, sin texto
  const parts = [];
  for (let i = 0; i < N; i++) {
    const part = path.join(workDir, `part${i}.mp4`);
    const vf = `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},setsar=1,fps=30,format=yuv420p`;

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
  //    memoria porque solo decodifica 2 clips (ya livianos) a la vez.
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

  // 3. Extender el video (congelando el último frame) hasta cubrir audio + cola de
  //    4s, y cerrar con fade-to-black — el crossfade acorta el video por debajo de
  //    la duración del audio, así que sin esto la narración se cortaba en seco.
  const targetDur   = duration + tailAfterVoice;
  const extendNeeded = Math.max(0, targetDur - accDur);
  const closeFade    = 1.0;
  const extended = path.join(workDir, "extended.mp4");
  await run([
    "-y", "-i", acc,
    "-vf", `tpad=stop_mode=clone:stop_duration=${extendNeeded.toFixed(2)},fade=t=out:st=${Math.max(0, targetDur - closeFade).toFixed(2)}:d=${closeFade}`,
    "-c:v", "libx264", "-preset", "ultrafast", "-crf", "24",
    extended
  ], "extender + cierre");

  // 4. Mux con la voz de Guillermo — audio con padding de silencio, duración exacta
  //    forzada (nada de -shortest, que era lo que cortaba la narración antes de tiempo).
  await run([
    "-y", "-i", extended, "-i", audioFile,
    "-filter_complex", "[1:a]apad[a]",
    "-map", "0:v", "-map", "[a]",
    "-c:v", "copy",
    "-c:a", "aac", "-ar", "44100", "-b:a", "128k",
    "-t", targetDur.toFixed(2),
    outPath
  ], "mux audio");

  return outPath;
}

module.exports = { renderVideo };
