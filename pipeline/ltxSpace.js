// Generación de VIDEO real (no imagen fija con zoom) 100% GRATIS vía Spaces
// públicos de Hugging Face con el modelo open-source LTX-Video (GPU ZeroGPU
// real). Contrato de API re-verificado en vivo el 2026-07-07 con
// client.view_api() — había cambiado desde la integración original.
//
// HALLAZGO CRÍTICO #1 (resolución/duración): a resolución alta (512x512 o
// 704x1280) con duration_ui=3, el worker de ZeroGPU se cae con "RuntimeError"
// genérico — reproducible, independiente de la cuota. Aislado por bisección:
// 256x256 con duration_ui hasta 2s SÍ funciona de forma confiable. El render
// (renderVideo.js) escala/recorta cada clip a 720x1280 después, así que solo
// se pierde detalle nativo, no el movimiento real.
//
// HALLAZGO CRÍTICO #2 (cuota): la cuota gratuita de ZeroGPU NO es por Space,
// es por CUENTA que llama (el HF_TOKEN) — confirmado en vivo: agotar la cuota
// generando video también bloqueó la voz (XTTS-v2, otro Space) con el MISMO
// token. Por eso este módulo rota entre MÚLTIPLES tokens (pipeline/hfPool.js)
// Y múltiples Spaces — cada combinación token×Space que falle por cuota o
// error se descarta y se prueba la siguiente, hasta agotar la matriz completa
// o encontrar una que funcione. Con 1 solo token (estado actual) rota solo
// entre Spaces; agregar HF_TOKEN_2/3/4/5 en Railway multiplica la cuota real
// disponible sin tocar código — cada cuenta gratuita nueva de HF (~2 min crear)
// es un presupuesto de GPU independiente.

const { Client, handle_file } = require("@gradio/client");
const hfPool = require("./hfPool");

// Varios forks/despliegues públicos del mismo modelo LTX-Video — Spaces
// DISTINTOS (dueños distintos), cada uno con su propio contrato ya verificado
// compatible (misma familia de parámetros: height_ui/width_ui/duration_ui/etc).
const SPACE_IDS = [
  "DeepRat/LTX-Video-ZeroGPU-Optimized",
  "Lightricks/ltx-video-distilled",
];

// Resolución nativa segura (probada en vivo, no crashea el worker) — el render
// final la escala a 720x1280, así que esto solo afecta el detalle fino, no el
// aspecto ni la duración del clip.
const SAFE_RES = 256;
const SAFE_MAX_DURATION = 2; // segundos — 3s a esta u otras resoluciones causó RuntimeError reproducible
const NEGATIVE_PROMPT = "worst quality, inconsistent motion, blurry, jittery, distorted, static, text, watermark, logo";

function isQuotaOrTransientError(e) {
  const msg = (e && e.message) || String(e);
  return /quota|RuntimeError|timeout|ZeroGPU|Connection/i.test(msg);
}

// Intenta la matriz completa (token × space) hasta que uno funcione. attemptFn
// recibe (client) y debe devolver la URL del video o lanzar si falla.
async function tryAcrossPool(attemptFn) {
  const tokens = hfPool.rotatedTokens();
  let lastError;
  for (const token of tokens) {
    for (const spaceId of SPACE_IDS) {
      try {
        const client = await Client.connect(spaceId, token ? { hf_token: token } : {});
        return await attemptFn(client);
      } catch (e) {
        lastError = e;
        if (!isQuotaOrTransientError(e)) throw e; // error real de parámetros/código: no tiene sentido rotar
        // cuota agotada / worker caído en esta combinación — probar la siguiente
      }
    }
  }
  throw lastError || new Error("LTX-Video: sin combinaciones token/Space disponibles");
}

// prompt: inglés, corto, descriptivo. durationSeconds: se limita a máx 2s (límite
// real probado antes de que el worker se caiga).
async function generateClip(prompt, durationSeconds = SAFE_MAX_DURATION) {
  const duration = Math.min(SAFE_MAX_DURATION, Math.max(1, durationSeconds));
  return tryAcrossPool(async (client) => {
    const result = await client.predict("/text_to_video", {
      prompt,
      negative_prompt: NEGATIVE_PROMPT,
      height_ui: SAFE_RES,
      width_ui: SAFE_RES,
      mode: "text-to-video",
      duration_ui: duration,
      ui_frames_to_use: 9,
      randomize_seed: true,
      ui_guidance_scale: 1,
      improve_texture_flag: false, // "mejora de textura" multi-escala es lo que dispara el RuntimeError/cuota alta
      slow_motion_flag: false
    });
    const video = result.data?.[0];
    const url = video?.video?.url || video?.video?.path;
    if (!url) throw new Error("LTX-Video Space: respuesta sin video reconocible — " + JSON.stringify(result.data).slice(0, 300));
    return url;
  });
}

// imagePath: ruta local (o URL) de una imagen YA generada por IA (Pollinations)
// que se anima con movimiento real de cámara/escena.
async function generateClipFromImage(imagePath, motionPrompt, durationSeconds = SAFE_MAX_DURATION) {
  const duration = Math.min(SAFE_MAX_DURATION, Math.max(1, durationSeconds));
  return tryAcrossPool(async (client) => {
    const result = await client.predict("/image_to_video", {
      prompt: motionPrompt,
      negative_prompt: NEGATIVE_PROMPT,
      input_image_filepath: handle_file(imagePath),
      height_ui: SAFE_RES,
      width_ui: SAFE_RES,
      mode: "image-to-video",
      duration_ui: duration,
      ui_frames_to_use: 9,
      randomize_seed: true,
      ui_guidance_scale: 1,
      improve_texture_flag: false,
      slow_motion_flag: false
    });
    const video = result.data?.[0];
    const url = video?.video?.url || video?.video?.path;
    if (!url) throw new Error("LTX-Video Space (image_to_video): respuesta sin video reconocible — " + JSON.stringify(result.data).slice(0, 300));
    return url;
  });
}

module.exports = { generateClip, generateClipFromImage };
