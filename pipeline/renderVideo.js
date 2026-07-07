const { spawn, execSync, spawnSync } = require("child_process");
const path = require("path");
const fs = require("fs");

// Preferir ffmpeg del sistema (nixpacks); fallback a ffmpeg-static
let ffmpegPath;
try {
  execSync("ffmpeg -version", { stdio: "ignore" });
  ffmpegPath = "ffmpeg";
} catch {
  ffmpegPath = require("ffmpeg-static");
}
console.log("ffmpeg en uso:", ffmpegPath);

// Timeout DURO por comando individual de ffmpeg — antes un solo comando colgado
// (ej. un archivo de Pexels con un códec/contenedor raro) se quedaba corriendo
// para siempre; solo existía un timeout general de 10 minutos en server.js que
// además NO mataba el proceso hijo, solo dejaba de esperarlo desde JS. Ahora cada
// paso individual tiene 45s: si no termina, se mata el proceso y se sabe EXACTAMENTE
// cuál paso fue el culpable (el error lo dice), en vez de un cuelgue silencioso.
function run(args, label, timeoutMs = 45000) {
  return new Promise((resolve, reject) => {
    const ff = spawn(ffmpegPath, args);
    let stderr = "";
    let settled = false;
    const killer = setTimeout(() => {
      if (settled) return;
      settled = true;
      ff.kill("SIGKILL");
      reject(new Error(`${label} TIMEOUT (>${timeoutMs / 1000}s, proceso matado): ` + stderr.slice(-500)));
    }, timeoutMs);
    ff.stderr.on("data", d => { stderr += d.toString(); });
    ff.on("error", e => { if (settled) return; settled = true; clearTimeout(killer); reject(e); });
    ff.on("close", code => {
      if (settled) return;
      settled = true;
      clearTimeout(killer);
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

// clips: array de { path, type } — type "video" (clip animado DoP) o "image"
// (fallback cuando DoP falló tras reintentar: se usa la imagen fija con zoom).
async function renderVideo({ clips, audioFile, duration, outPath, onProgress = () => {} }) {
  const N = clips.length;
  const segDur = Math.max(3, duration / N);
  const workDir = path.dirname(clips[0].path);
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
  // Se quitó el filtro "noise" (grano): era el más caro del render y con 12 clips
  // hacía que ffmpeg se pasara del timeout. El look de marca (color+viñeta+contraste)
  // se mantiene y sigue viéndose premium, pero procesa mucho más rápido.
  const brandGrade = "colorbalance=rm=0.05:gm=0.01:bm=-0.07:rh=0.04:bh=-0.05:rs=0.02:bs=-0.03," +
    "eq=contrast=1.08:saturation=1.06,vignette=PI/4";
  // Glitch de aberración cromática: retirado a pedido — riesgo de verse "barato/gimmick"
  // en vez de profesional. Se deja solo el look de marca (color, viñeta, grano).
  const glitchFor = () => "";

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
    const clip = clips[i];
    const isImage = clip.type === "image";

    const zoomFrames = Math.round(segDur * 30);
    // El hook (primer segmento) lleva un zoom-in más marcado y rápido para que el
    // "pattern interrupt" pegue más fuerte; el resto alterna un zoom sutil in/out.
    const zoomRate = i === 0 ? "0.0022" : "0.0006";
    const zoomDir = i === 0 || i % 2 === 0 ? `zoom+${zoomRate}` : `zoom-${zoomRate}`;
    // Escala a 1.25x (antes 2x) — suficiente margen para el zoom Ken Burns pero
    // procesa mucho más rápido; el zoompan sigue reduciendo a la salida final wxh.
    const sw = Math.round(w * 1.25), sh = Math.round(h * 1.25);
    // BUG RAÍZ del cuelgue/timeout de ffmpeg: el parámetro "d" de zoompan es cuántos
    // FRAMES DE SALIDA genera por cada FRAME DE ENTRADA. Con una imagen fija (-loop 1,
    // un solo frame repetido) hay que poner d=zoomFrames para "estirarla" a la duración
    // deseada. Pero con un clip de VIDEO real (ya tiene ~200-300 frames propios), poner
    // d=zoomFrames multiplica CADA uno de esos frames por zoomFrames más — con un clip
    // de 9s eso son cientos de miles de frames de salida, por eso el proceso nunca
    // terminaba en 45s (llevaba 111s y subiendo cuando se mató). Para video, d debe
    // ser 1 (un frame de salida por cada frame de entrada); el zoom se sigue viendo
    // suave porque zoompan acumula el nivel de zoom internamente frame a frame.
    const zoomD = isImage ? zoomFrames : 1;
    // Para video (d=1) hay que normalizar el fps ANTES de zoompan con un filtro "fps=30"
    // explícito — si no, cuando el clip fuente no es exactamente 30fps (Pexels trae
    // 24/25/29.97fps variados), zoompan solo re-etiqueta los frames existentes a 30fps
    // sin insertar/duplicar los que faltan, y la duración real del clip se encoge
    // (verificado: un clip de 9.4s a 25fps salía en 7.83s). "fps=30" primero hace la
    // conversión de framerate correctamente (duplicando/descartando frames), preservando
    // la duración real exacta antes de que zoompan trabaje 1:1.
    const fpsNormalize = isImage ? "" : "fps=30,";
    const vf = `${fpsNormalize}scale=${sw}:${sh}:force_original_aspect_ratio=increase,crop=${sw}:${sh},` +
      `zoompan=z='${zoomDir}':d=${zoomD}:s=${w}x${h}:fps=30,setsar=1,${brandGrade}${glitchFor(i)},format=yuv420p`;

    let args;
    if (isImage) {
      // Imagen fija (DoP falló) — "-loop 1" la convierte en un video de la duración
      // exacta que pidamos; el zoom Ken Burns hace que no se sienta estática.
      args = ["-y", "-loop", "1", "-i", clip.path, "-t", segDur.toFixed(2), "-vf", vf,
        "-an", "-c:v", "libx264", "-preset", "ultrafast", "-crf", "24", part];
    } else {
      const realDur = probeDuration(clip.path);
      if (!realDur) throw new Error(`Clip ${i + 1}: no se pudo leer su duración real (archivo posiblemente corrupto)`);
      args = ["-y", "-i", clip.path];
      if (realDur < segDur - 0.1) {
        // clip más corto que segDur: congelar último frame hasta completar
        args.push("-vf", `${vf},tpad=stop_mode=clone:stop_duration=${(segDur - realDur).toFixed(2)}`);
      } else {
        args.push("-t", segDur.toFixed(2), "-vf", vf);
      }
      args.push("-an", "-c:v", "libx264", "-preset", "ultrafast", "-crf", "24", part);
    }

    onProgress(`Procesando clip ${i + 1}/${N} (ffmpeg)...`);
    await run(args, `clip ${i + 1}`, 60000);
    const partDur = probeDuration(part);
    if (partDur < segDur - 0.5) {
      throw new Error(`Clip ${i + 1}: quedó en ${partDur.toFixed(1)}s, se esperaban ${segDur.toFixed(1)}s — revisar el clip fuente`);
    }
    parts.push(part);
  }

  // 2. Unir TODOS los clips en UN SOLO PASO con el concat demuxer y "-c copy"
  //    (sin re-codificar) — casi instantáneo y con bajísimo uso de memoria.
  //    ANTES: se unían de a pares con xfade, re-codificando TODO el video
  //    acumulado en cada paso (O(N²)); con 12 clips eran 11 pasadas cada vez más
  //    pesadas que hacían que Railway se quedara sin memoria/tiempo y reiniciara,
  //    perdiendo el job entero. Como todos los `parts` ya están normalizados a
  //    exactamente wxh, 30fps, libx264, yuv420p y misma duración, el corte entre
  //    ellos es un corte duro limpio (estilo reel rápido) y accDur es exacto.
  // El concat demuxer resuelve rutas relativas al directorio del propio archivo
  // de lista; por eso se escriben solo los nombres base (los parts están en workDir).
  onProgress("Uniendo todos los clips (concat)...");
  const listPath = path.join(workDir, "concat.txt");
  fs.writeFileSync(listPath, parts.map(p => `file '${path.basename(p)}'`).join("\n"));
  const acc = path.join(workDir, "concat.mp4");
  await run(["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", acc], "concat clips", 60000);
  let accDur = probeDuration(acc);
  if (accDur < N * segDur - 1) {
    throw new Error(`Concat: quedó en ${accDur.toFixed(1)}s, se esperaban ~${(N * segDur).toFixed(1)}s`);
  }

  // 3. Extender el video (congelando el último frame) hasta cubrir audio + cola de
  //    4s, y cerrar con fade-to-black — el crossfade acorta el video por debajo de
  //    la duración del audio, así que sin esto la narración se cortaba en seco.
  const targetDur   = duration + tailAfterVoice;
  const extendNeeded = Math.max(0, targetDur - accDur);
  const closeFade    = 1.0;
  onProgress("Extendiendo y cerrando el video...");
  const extended = path.join(workDir, "extended.mp4");
  await run([
    "-y", "-i", acc,
    "-vf", `tpad=stop_mode=clone:stop_duration=${extendNeeded.toFixed(2)},fade=t=out:st=${Math.max(0, targetDur - closeFade).toFixed(2)}:d=${closeFade}`,
    "-c:v", "libx264", "-preset", "ultrafast", "-crf", "24",
    extended
  ], "extender + cierre", 90000);

  // 4. Mux con la voz — audio con padding de silencio, duración exacta forzada
  //    (nada de -shortest, que era lo que cortaba la narración antes de tiempo).
  onProgress("Mezclando audio final...");
  await run([
    "-y", "-i", extended, "-i", audioFile,
    "-filter_complex", "[1:a]apad[a]",
    "-map", "0:v", "-map", "[a]",
    "-c:v", "copy",
    "-c:a", "aac", "-ar", "44100", "-b:a", "128k",
    "-t", targetDur.toFixed(2),
    outPath
  ], "mux audio", 60000);

  // 5. Verificación final — si el video real quedó corto vs el audio, fallar RUIDOSO
  //    en vez de entregar (y cobrar) un reel roto como si estuviera "completo".
  const finalDur = probeDuration(outPath);
  if (finalDur < targetDur - 2) {
    throw new Error(`RENDER INCOMPLETO: el video final quedó en ${finalDur.toFixed(1)}s pero el audio dura ${targetDur.toFixed(1)}s — no se debe entregar este archivo`);
  }

  return outPath;
}

module.exports = { renderVideo };
