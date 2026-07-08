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

// Negative prompt de Wan (verificado que existe en su schema real vía
// openapi.json) — refuerza contra el look apagado/genérico que reportó el
// usuario, además de artefactos típicos de animación barata.
const WAN_NEGATIVE_PROMPT = "dull, muted colors, flat lighting, generic stock photo, low contrast, plastic look, static, blurry, distorted, watermark, text, logo, low quality";

// Parámetros de ahorro de costo COMPARTIDOS por ambas funciones (BUG REAL
// corregido: antes solo animateImage() tenía resolution=480p/num_frames=81,
// pero el pipeline real usa animateProductUrl(), que no los tenía — cada clip
// pagado se estaba cobrando a 720p ($0.40) en vez de 480p ($0.20), EL DOBLE
// del costo pretendido). Wan cobra POR VIDEO, no por segundo: 480p=$0.20 vs
// 720p=$0.40. num_frames=81 es el mínimo que evita el recargo de 1.25x.
const WAN_COST_PARAMS = { resolution: "480p", aspect_ratio: "9:16", num_frames: 81 };

async function callWan(imageUrl, motionPrompt) {
  const result = await fal.subscribe("fal-ai/wan-i2v", {
    input: { prompt: motionPrompt, image_url: imageUrl, negative_prompt: WAN_NEGATIVE_PROMPT, ...WAN_COST_PARAMS },
    logs: false
  });
  const url = result?.data?.video?.url || result?.video?.url;
  if (!url) throw new Error("fal wan-i2v: respuesta sin video — " + JSON.stringify(result).slice(0, 300));
  return url;
}

// imagePathOrBuffer: ruta local o Buffer de la imagen a animar (primer frame).
async function animateImage(imagePathOrBuffer, motionPrompt) {
  ensureConfigured();
  const buffer = Buffer.isBuffer(imagePathOrBuffer)
    ? imagePathOrBuffer
    : fs.readFileSync(imagePathOrBuffer);
  const blob = new Blob([buffer], { type: "image/jpeg" });
  const imageUrl = await fal.storage.upload(blob);
  return callWan(imageUrl, motionPrompt);
}

// Variante para inserción de producto (o cualquier imagen ya generada por
// fal FLUX): recibe directamente la URL pública (sin re-subir) y la anima.
// Esta es la que usa el pipeline principal (server.js).
async function animateProductUrl(productImageUrl, motionPrompt) {
  ensureConfigured();
  return callWan(productImageUrl, motionPrompt);
}

// Genera la imagen del primer frame con FLUX schnell en fal (~$0.003, casi
// gratis y CONFIABLE — sin el límite de velocidad de Pollinations gratis que
// nos bloquea constantemente). Devuelve la URL pública de la imagen, lista para
// pasarla directo a animateProductUrl (sin re-subir). Solo tiene sentido usar
// esto cuando ya vamos a pagar la animación de todos modos.
// FLUX schnell NO soporta negative_prompt (verificado en su schema real) — el
// refuerzo contra el look apagado/genérico va en el prompt POSITIVO (ver el
// cierre obligatorio "vibrant saturated color..." en generateScript.js).
async function generateImageUrl(prompt) {
  ensureConfigured();
  const result = await fal.subscribe("fal-ai/flux/schnell", {
    input: { prompt, image_size: "portrait_16_9", num_images: 1 },
    logs: false
  });
  const url = result?.data?.images?.[0]?.url || result?.images?.[0]?.url;
  if (!url) throw new Error("fal flux: respuesta sin imagen — " + JSON.stringify(result).slice(0, 300));
  return url;
}

function isConfigured() {
  return !!process.env.FAL_KEY;
}

module.exports = { animateImage, animateProductUrl, generateImageUrl, isConfigured };
