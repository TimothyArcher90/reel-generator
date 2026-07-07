// Generación de video 100% GRATIS vía el Space público de Hugging Face
// "DeepRat/LTX-Video-ZeroGPU-Optimized" (modelo open-source LTX-Video, GPU
// gratuita ZeroGPU). Verificado en vivo el 2026-07-06 con @gradio/client:
// endpoint real /text_to_video, parámetros confirmados por view_api(), no
// adivinados. Cuota gratis diaria muy limitada (minutos), mayor si se
// autentica con HF_TOKEN (cuenta gratis, sin pagar) — ver HF_TOKEN abajo.
//
// Reemplaza a Higgsfield Cloud (pago, saldo agotado) para no depender de
// recargas — a cambio de cuota diaria limitada y disponibilidad compartida
// con la comunidad (puede haber cola o fallar si el Space está ocupado).

const { Client, handle_file } = require("@gradio/client");

const SPACE_ID = "DeepRat/LTX-Video-ZeroGPU-Optimized";

function clientOptions() {
  const token = process.env.HF_TOKEN;
  return token ? { hf_token: token } : {};
}

async function connect() {
  return Client.connect(SPACE_ID, clientOptions());
}

// prompt: inglés, corto, descriptivo (mismo estilo que ya usábamos para Higgsfield)
// durationSeconds: se limita a un rango corto para no exceder la cuota gratis por llamada
async function generateClip(prompt, durationSeconds = 3) {
  const app = await connect();
  const duration = Math.min(4, Math.max(2, Math.round(durationSeconds)));
  const result = await app.predict("/text_to_video", {
    prompt,
    mode: "text-to-video",
    duration_ui: duration,
    height_ui: 1280,
    width_ui: 720
  });
  // returns: [video {video, subtitles}, download_video_path, download_gif_path, seed]
  const video = result.data?.[0];
  const url = video?.video?.url || video?.video?.path || result.data?.[1];
  if (!url) throw new Error("LTX-Video Space: respuesta sin video reconocible — " + JSON.stringify(result.data).slice(0, 300));
  return url;
}

// imageUrl: URL pública o path local de una imagen ya generada/existente
async function generateClipFromImage(imageUrl, motionPrompt, durationSeconds = 3) {
  const app = await connect();
  const duration = Math.min(4, Math.max(2, Math.round(durationSeconds)));
  const result = await app.predict("/image_to_video", {
    prompt: motionPrompt,
    input_image_filepath: handle_file(imageUrl),
    duration_ui: duration,
    height_ui: 1280,
    width_ui: 720
  });
  // image_to_video devuelve [video, seed] — NO usar data[1] como fallback de URL,
  // ahí viene la semilla numérica, no una ruta.
  const video = result.data?.[0];
  const url = video?.video?.url || video?.video?.path;
  if (!url) throw new Error("LTX-Video Space (image_to_video): respuesta sin video reconocible — " + JSON.stringify(result.data).slice(0, 300));
  return url;
}

module.exports = { generateClip, generateClipFromImage };
