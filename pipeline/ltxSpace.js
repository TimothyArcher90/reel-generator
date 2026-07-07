// Generación de VIDEO real (no imagen fija con zoom) 100% GRATIS vía el Space
// público de Hugging Face "DeepRat/LTX-Video-ZeroGPU-Optimized" (modelo
// open-source LTX-Video, GPU ZeroGPU real). Contrato de API re-verificado en
// vivo el 2026-07-07 con client.view_api() — el contrato había CAMBIADO desde
// la integración original, lo cual causaba errores silenciosos independientes
// de la cuota.
//
// HALLAZGO CRÍTICO (2026-07-07, probado en vivo con presupuesto real, no
// adivinado): a resolución alta (512x512 o 704x1280) con duration_ui=3, el
// worker de ZeroGPU se cae con "RuntimeError" genérico — reproducible varias
// veces, independiente de la cuota (falla en <25s, antes de que la cuota
// llegara a 0). Aislado por bisección: 256x256 con duration_ui hasta 2s SÍ
// funciona de forma confiable (2 corridas exitosas reales). Por eso este
// módulo genera el video a 256x256 (barato, estable) y el pipeline de render
// (renderVideo.js) ya escala/recorta cada clip a 720x1280 — se pierde algo de
// detalle nativo pero se preserva el MOVIMIENTO REAL, que es el requisito no
// negociable del usuario (nunca imagen estática).
//
// width_ui/height_ui deben ser múltiplos de 32 (256-1280).
// Cuota ZeroGPU gratis diaria muy limitada — con HF_TOKEN (cuenta gratis) sube
// algo, pero sigue siendo un recurso compartido con la comunidad. El caller
// SIEMPRE debe usar timeout acotado y tener un respaldo (imagen fija + Ken
// Burns) para cuando se agote.

const { Client, handle_file } = require("@gradio/client");

const SPACE_ID = "DeepRat/LTX-Video-ZeroGPU-Optimized";

// Resolución nativa segura (probada en vivo, no crashea el worker) — el render
// final la escala a 720x1280, así que esto solo afecta el detalle fino, no el
// aspecto ni la duración del clip.
const SAFE_RES = 256;
const SAFE_MAX_DURATION = 2; // segundos — 3s a esta u otras resoluciones causó RuntimeError reproducible

function clientOptions() {
  const token = process.env.HF_TOKEN;
  return token ? { hf_token: token } : {};
}

async function connect() {
  return Client.connect(SPACE_ID, clientOptions());
}

const NEGATIVE_PROMPT = "worst quality, inconsistent motion, blurry, jittery, distorted, static, text, watermark, logo";

// prompt: inglés, corto, descriptivo. durationSeconds: se limita a máx 2s (límite
// real probado del Space antes de que el worker se caiga).
async function generateClip(prompt, durationSeconds = SAFE_MAX_DURATION) {
  const app = await connect();
  const duration = Math.min(SAFE_MAX_DURATION, Math.max(1, durationSeconds));
  const result = await app.predict("/text_to_video", {
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
}

// imagePath: ruta local (o URL) de una imagen YA generada por IA (Pollinations)
// que se anima con movimiento real de cámara/escena. NOTA: image_to_video no
// se pudo verificar funcionando a SAFE_RES antes de agotar la cuota de prueba
// — se deja implementado con los mismos parámetros seguros de text_to_video
// por consistencia, pero generateClip() (text-to-video directo) es la vía
// principal y probada del pipeline (ver server.js).
async function generateClipFromImage(imagePath, motionPrompt, durationSeconds = SAFE_MAX_DURATION) {
  const app = await connect();
  const duration = Math.min(SAFE_MAX_DURATION, Math.max(1, durationSeconds));
  const result = await app.predict("/image_to_video", {
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
}

module.exports = { generateClip, generateClipFromImage };
