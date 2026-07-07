// Animación image->video REAL y CONFIABLE vía fal.ai (de pago, ~$0.05-0.10 por
// clip). Modelo: fal-ai/wan-i2v (Wan 2.1 image-to-video, el que eligió el
// usuario, pero hospedado para no tener que administrar GPU). Contrato de API
// verificado en la doc oficial (fal.ai/models/fal-ai/wan-i2v/api), no adivinado:
//   input:  { prompt, image_url }
//   output: { video: { url } }
//
// CLAVE DE COSTO (el usuario exige no perder plata): este motor SOLO se usa
// como respaldo cuando el LTX-Video GRATIS se queda sin cuota — así se paga
// únicamente por los clips que de otro modo saldrían como imagen fija. Si el
// LTX gratis funciona, no se gasta un centavo. Ver el orden en server.js.
//
// image_url acepta CUALQUIER URL pública — incluida la foto de un PRODUCTO que
// el usuario quiera insertar: se pasa como primer frame y Wan anima una escena
// cinematográfica alrededor de él (inserción de producto nativa).
//
// Solo se activa si FAL_KEY está configurada en el entorno (Railway). Sin la
// key, este módulo lanza y el pipeline sigue con los respaldos gratuitos —
// nunca puede gastar sin que el usuario haya puesto la key a propósito.
const { fal } = require("@fal-ai/client");
const fs = require("fs");

function ensureConfigured() {
  const key = process.env.FAL_KEY;
  if (!key) throw new Error("NO_FAL_KEY: fal.ai no configurado (no se gasta)");
  fal.config({ credentials: key });
}

// imagePathOrBuffer: ruta local o Buffer de la imagen a animar (primer frame).
// motionPrompt: descripción en inglés del movimiento/escena deseada.
// durationHint: se registra pero Wan controla su propia duración (~5s); el
// render luego recorta/ajusta a lo que necesite cada segmento.
async function animateImage(imagePathOrBuffer, motionPrompt) {
  ensureConfigured();
  const buffer = Buffer.isBuffer(imagePathOrBuffer)
    ? imagePathOrBuffer
    : fs.readFileSync(imagePathOrBuffer);
  // Subir la imagen al storage de fal para obtener una URL pública que el
  // modelo pueda leer (evita depender de que la imagen ya esté hospedada).
  const blob = new Blob([buffer], { type: "image/jpeg" });
  const imageUrl = await fal.storage.upload(blob);

  const result = await fal.subscribe("fal-ai/wan-i2v", {
    input: {
      prompt: motionPrompt,
      image_url: imageUrl,
      // AHORRO DE COSTO (verificado en la doc de fal): Wan cobra POR VIDEO, no
      // por segundo. 480p = $0.20 (0.5 unidades) vs 720p = $0.40 (1 unidad) —
      // la MITAD de precio. El reel final es vertical 720x1280 y el render lo
      // reescala igual, así que 480p animado se ve bien y cuesta la mitad.
      // num_frames=81 es el mínimo que EVITA el recargo de 1.25x (>81 frames).
      resolution: "480p",
      aspect_ratio: "9:16",
      num_frames: 81
    },
    logs: false
  });
  const url = result?.data?.video?.url || result?.video?.url;
  if (!url) throw new Error("fal wan-i2v: respuesta sin video — " + JSON.stringify(result).slice(0, 300));
  return url;
}

// Variante para inserción de producto: recibe directamente la URL pública de la
// foto del producto (sin re-subir) y la anima.
async function animateProductUrl(productImageUrl, motionPrompt) {
  ensureConfigured();
  const result = await fal.subscribe("fal-ai/wan-i2v", {
    input: { prompt: motionPrompt, image_url: productImageUrl },
    logs: false
  });
  const url = result?.data?.video?.url || result?.video?.url;
  if (!url) throw new Error("fal wan-i2v: respuesta sin video — " + JSON.stringify(result).slice(0, 300));
  return url;
}

function isConfigured() {
  return !!process.env.FAL_KEY;
}

module.exports = { animateImage, animateProductUrl, isConfigured };
