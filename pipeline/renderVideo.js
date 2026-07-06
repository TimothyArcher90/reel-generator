const { spawn, execSync, spawnSync } = require("child_process");
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

// Duración REAL de un archivo (no asumida) — clave para no arrastrar el mismatch
// que rompía el video antes (se asumía que cada clip medía exactamente segDur,
// pero Higgsfield a veces devuelve clips más cortos, y xfade con un offset mal
// calculado producía un video final de solo ~12s aunque el audio durara 55s).
function probeDuration(filePath) {
  const result = spawnSync(ffmpegPath, ["-i", filePath, "-f", "null", "-"], { encoding: "utf8", timeout: 15000 });
  const stderr = (result.stderr || "") + (result.stdout || "");
  const match = stderr.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/);
  if (!match) return 0;
  const [, hh, mm, ss] = match;
  return (+hh) * 3600 + (+mm) * 60 + parseFloat(ss);
}

async function renderVideo({ clips, audioFile, duration, outPath }) {
  const N = clips.length;
  const segDur = Math.max(3, duration / N);
  const workDir = path.dirname(clips[0]);
  const w = 720, h = 1280;
  const tailAfterVoice = 4;   // segundos de video que siguen después de terminar la narración

  // Trucos de montaje: transición distinta en cada corte (no siempre "fade"), y
  // duración de corte más rápida al inicio (energía del hook) que hacia el cierre
  // (sensación de resolución) — en vez de un crossfade fijo e idéntico siempre.
  // El primer corte usa "fadewhite" (flash blanco) para un golpe de energía extra.
  const transitionTypes = ["fade", "wipeleft", "circleopen", "slideup", "wiperight", "diagtl"];
  const transTypeFor = cutIndex => cutIndex === 0 ? "fadewhite" : transitionTypes[cutIndex % transitionTypes.length];
  const transDurFor = cutIndex => (cutIndex < 2 ? 0.25 : cutIndex >= N - 3 ? 0.6 : 0.4);

  // Look de marca por clip (todo gratis, ffmpeg puro, cero costo de API):
  //  - colorbalance: empuja medios/altas luces hacia dorado/ámbar, sombras más frías —
  //    refuerza la paleta negro+dorado en cada clip de forma consistente
  //  - vignette: oscurece bordes, centra la atención, look cinematográfico
  //  - noise: grano de película sutil, sensación "premium" en vez de plano/digital
  //  - eq: contraste y saturación ligeramente elevados
  const brandGrade = "colorbalance=rm=0.05:gm=0.01:bm=-0.07:rh=0.04:bh=-0.05:rs=0.02:bs=-0.03," +
    "eq=contrast=1.08:saturation=1.06,vignette=PI/4,noise=alls=5:allf=t+u";
  // Glitch de aberración cromática, alternado en clips impares para variar el ritmo visual
  const glitchFor = i => (i % 3 === 1 ? ",rgbashift=rh=2:bh=-2" : "");

  // 1. Procesar cada clip a una duración UNIFORME real de segDur — antes se asumía
  //    ciegamente que cada clip de Higgsfield medía exactamente segDur, pero a veces
  //    llega más corto; recortarlo con "-t" sobre un clip corto simplemente no hace
  //    nada (no rellena), y eso desalineaba el cálculo de "offset" del xfade, rompiendo
  //    el video final a la mitad (causa raíz confirmada del bug de 11.9s vs 55s de audio).
  //    Ahora: si el clip real es más corto, se extiende congelando su último frame;
  //    si es más largo, se recorta. Siempre queda en exactamente segDur.
  //    Se agrega además un zoom lento (Ken Burns) para que ningún plano se sienta estático.
  const parts = [];
  for (let i = 0; i < N; i++) {
    const part = path.join(workDir, `part${i}.mp4`);
    const realDur = probeDuration(clips[i]);
    if (!realDur) throw new Error(`Clip ${i + 1}: no se pudo leer su duración real (archivo posiblemente corrupto)`);

    const zoomFrames = Math.round(segDur * 30);
    // El hook (primer segmento) lleva un zoom-in más marcado y rápido para que el
    // "pattern interrupt" pegue más fuerte; el resto alterna un zoom sutil in/out.
    const zoomRate = i === 0 ? "0.0022" : "0.0006";
    const zoomDir = i === 0 || i % 2 === 0 ? `zoom+${zoomRate}` : `zoom-${zoomRate}`;
    const vf = `scale=${w * 2}:${h * 2}:force_original_aspect_ratio=increase,crop=${w * 2}:${h * 2},` +
      `zoompan=z='${zoomDir}':d=${zoomFrames}:s=${w}x${h}:fps=30,setsar=1,${brandGrade}${glitchFor(i)},format=yuv420p`;

    const args = ["-y", "-i", clips[i]];
    if (realDur < segDur - 0.1) {
      // clip más corto que segDur: congelar último frame hasta completar
      args.push("-vf", `${vf},tpad=stop_mode=clone:stop_duration=${(segDur - realDur).toFixed(2)}`);
    } else {
      args.push("-t", segDur.toFixed(2), "-vf", vf);
    }
    args.push("-an", "-c:v", "libx264", "-preset", "ultrafast", "-crf", "24", part);

    await run(args, `clip ${i + 1}`);
    const partDur = probeDuration(part);
    if (partDur < segDur - 0.5) {
      throw new Error(`Clip ${i + 1}: quedó en ${partDur.toFixed(1)}s, se esperaban ${segDur.toFixed(1)}s — revisar el clip fuente`);
    }
    parts.push(part);
  }

  // 2. Unir con crossfade real (xfade), de a pares consecutivos — bajo consumo de
  //    memoria porque solo decodifica 2 clips (ya livianos) a la vez. Ahora accDur
  //    es exacto porque todos los parts miden segDur real, no una suposición.
  let acc = parts[0];
  let accDur = segDur;
  for (let i = 1; i < N; i++) {
    const cutIndex = i - 1;
    const trans = transDurFor(cutIndex);
    const transType = transTypeFor(cutIndex);
    const offset = Math.max(0, accDur - trans);
    const merged = path.join(workDir, `merge${i}.mp4`);
    await run([
      "-y", "-i", acc, "-i", parts[i],
      "-filter_complex", `[0:v][1:v]xfade=transition=${transType}:duration=${trans}:offset=${offset.toFixed(2)}[v]`,
      "-map", "[v]",
      "-c:v", "libx264", "-preset", "ultrafast", "-crf", "24",
      merged
    ], `xfade ${i} (${transType})`);
    const mergedDur = probeDuration(merged);
    const expectedDur = accDur + segDur - trans;
    if (mergedDur < expectedDur - 1) {
      throw new Error(`Unión ${i}/${N - 1}: quedó en ${mergedDur.toFixed(1)}s, se esperaban ~${expectedDur.toFixed(1)}s — el xfade se rompió a mitad de camino`);
    }
    acc = merged;
    accDur = mergedDur;
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

  // 4. Mux con la voz — audio con padding de silencio, duración exacta forzada
  //    (nada de -shortest, que era lo que cortaba la narración antes de tiempo).
  await run([
    "-y", "-i", extended, "-i", audioFile,
    "-filter_complex", "[1:a]apad[a]",
    "-map", "0:v", "-map", "[a]",
    "-c:v", "copy",
    "-c:a", "aac", "-ar", "44100", "-b:a", "128k",
    "-t", targetDur.toFixed(2),
    outPath
  ], "mux audio");

  // 5. Verificación final — si el video real quedó corto vs el audio, fallar RUIDOSO
  //    en vez de entregar (y cobrar) un reel roto como si estuviera "completo".
  const finalDur = probeDuration(outPath);
  if (finalDur < targetDur - 2) {
    throw new Error(`RENDER INCOMPLETO: el video final quedó en ${finalDur.toFixed(1)}s pero el audio dura ${targetDur.toFixed(1)}s — no se debe entregar este archivo`);
  }

  return outPath;
}

module.exports = { renderVideo };
