// Generación de VIDEO real (no imagen fija con zoom) 100% GRATIS vía el Space
// público de Hugging Face "DeepRat/LTX-Video-ZeroGPU-Optimized" (modelo
// open-source LTX-Video, GPU ZeroGPU real). Contrato de API re-verificado en
// vivo el 2026-07-07 con client.view_api() — el contrato había CAMBIADO desde
// la integración original (parámetros con nombres distintos: height_ui,
// width_ui, duration_ui, ui_frames_to_use, seed_ui, randomize_seed,
// ui_guidance_scale, improve_texture_flag, slow_motion_flag, negative_prompt),
// lo cual causaba errores silenciosos ("RuntimeError" genérico) independientes
// de la cuota. width_ui/height_ui deben ser múltiplos de 32 (256-1280) — 720 NO
// es múltiplo de 32, por eso se usa 704 (el más cercano válido).
//
// Cuota ZeroGPU gratis diaria muy limitada (segundos, no minutos, en cuentas
// nuevas) — con HF_TOKEN (cuenta gratis) sube algo, pero sigue siendo un
// recurso compartido con la comunidad. El caller SIEMPRE debe usar timeout
// acotado y tener un respaldo (imagen fija + Ken Burns) para cuando se agote.

const { Client, handle_file } = require("@gradio/client");

const SPACE_ID = "DeepRat/LTX-Video-ZeroGPU-Optimized";

function clientOptions() {
  const token = process.env.HF_TOKEN;
  return token ? { hf_token: token } : {};
}

async function connect() {
  return Client.connect(SPACE_ID, clientOptions());
}

const NEGATIVE_PROMPT = "worst quality, inconsistent motion, blurry, jittery, distorted, static, text, watermark, logo";

// prompt: inglés, corto, descriptivo. durationSeconds: se limita a máx 3s (pedido
// explícito del usuario: clips cortos, precisos, no zoom largo sobre una imagen).
async function generateClip(prompt, durationSeconds = 3) {
  const app = await connect();
  const duration = Math.min(3, Math.max(1, durationSeconds));
  const result = await app.predict("/text_to_video", {
    prompt,
    negative_prompt: NEGATIVE_PROMPT,
    height_ui: 1280,
    width_ui: 704,
    mode: "text-to-video",
    duration_ui: duration,
    ui_frames_to_use: 9,
    randomize_seed: true,
    ui_guidance_scale: 1,
    improve_texture_flag: true,
    slow_motion_flag: false
  });
  const video = result.data?.[0];
  const url = video?.video?.url || video?.video?.path;
  if (!url) throw new Error("LTX-Video Space: respuesta sin video reconocible — " + JSON.stringify(result.data).slice(0, 300));
  return url;
}

// imagePath: ruta local (o URL) de una imagen YA generada por IA (Pollinations)
// que se anima con movimiento real de cámara/escena — esto es lo que convierte
// "imagen fija" en "video real", pedido explícito del usuario.
async function generateClipFromImage(imagePath, motionPrompt, durationSeconds = 3) {
  const app = await connect();
  const duration = Math.min(3, Math.max(1, durationSeconds));
  const result = await app.predict("/image_to_video", {
    prompt: motionPrompt,
    negative_prompt: NEGATIVE_PROMPT,
    input_image_filepath: handle_file(imagePath),
    height_ui: 1280,
    width_ui: 704,
    mode: "image-to-video",
    duration_ui: duration,
    ui_frames_to_use: 9,
    randomize_seed: true,
    ui_guidance_scale: 1,
    improve_texture_flag: true,
    slow_motion_flag: false
  });
  const video = result.data?.[0];
  const url = video?.video?.url || video?.video?.path;
  if (!url) throw new Error("LTX-Video Space (image_to_video): respuesta sin video reconocible — " + JSON.stringify(result.data).slice(0, 300));
  return url;
}

module.exports = { generateClip, generateClipFromImage };
