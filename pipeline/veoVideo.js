// Animación image->video con Google Veo 3.1 (Gemini API) — alternativa de PAGO
// a fal.ai Wan (pipeline/falVideo.js). Se activa solo si GEMINI_API_KEY está
// configurada en el entorno (Railway) Y USE_VEO=true — nunca gasta sin que el
// usuario lo haya pedido a propósito, misma regla que fal.ai.
//
// Contrato de API — CORREGIDO dos veces en pruebas reales contra la API en
// vivo (2026-07-09), ninguna de las dos era adivinada pero la doc/resúmenes
// no coincidían con lo que la API realmente exige:
//   1) el campo de imagen es `bytesBase64Encoded` + `mimeType` directo en
//      `image`, NO `inlineData` (error 400 real: "inlineData isn't supported").
//   2) `durationSeconds` debe ser NÚMERO (4), no string ("4") — error 400 real:
//      "The value type for durationSeconds needs to be a number."
//   POST https://generativelanguage.googleapis.com/v1beta/models/{model}:predictLongRunning
//   body: { instances: [{ prompt, image: { bytesBase64Encoded, mimeType } }],
//           parameters: { aspectRatio, resolution, durationSeconds: <number> } }
//   -> devuelve { name: "operations/xxx" } (long-running operation)
//   poll: GET https://generativelanguage.googleapis.com/v1beta/{name}
//   -> cuando done=true, el video queda en la respuesta con una uri descargable
//      con el mismo header x-goog-api-key.
//
// Costo (verificado en ai.google.dev/gemini-api/docs/pricing, julio 2026):
//   veo-3.1-lite-generate-preview 720p = $0.05/seg -> clip de 4s = $0.20
//   veo-3.1-fast-generate-preview 720p = $0.10/seg -> clip de 4s = $0.40
// Comparable o más barato que fal.ai Wan (~$0.24-0.28/clip con imagen FLUX-pro
// incluida) y con audio nativo incluido. Elegir el tier con VEO_MODEL.
const axios = require("axios");

const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.VEO_MODEL || "veo-3.1-lite-generate-preview";
const BASE = "https://generativelanguage.googleapis.com/v1beta";

// Duración permitida por Veo: solo 4, 6 u 8 segundos (no acepta valores
// arbitrarios) — el llamador debe redondear segDur al valor permitido más
// cercano antes de invocar esto.
const ALLOWED_DURATIONS = [4, 6, 8];
function nearestAllowedDuration(seconds) {
  return ALLOWED_DURATIONS.reduce((best, d) =>
    Math.abs(d - seconds) < Math.abs(best - seconds) ? d : best
  );
}

function isConfigured() {
  return !!API_KEY && process.env.USE_VEO === "true";
}

async function fetchImageAsBase64(imageUrl) {
  const res = await axios.get(imageUrl, { responseType: "arraybuffer", timeout: 30000 });
  const mimeType = res.headers["content-type"] || "image/jpeg";
  return { mimeType, data: Buffer.from(res.data).toString("base64") };
}

// Envía la generación y devuelve el nombre de la operación de inmediato (no
// espera). Separado de animateProductUrl para poder exponer un endpoint de
// diagnóstico ASÍNCRONO (submit + poll en llamadas HTTP cortas separadas) —
// un endpoint sincrónico que espera los 30-90s+ que tarda Veo se topa con el
// timeout del proxy de Railway (probado en vivo: 502 "Application failed to
// respond" con la operación de Google posiblemente ya facturándose en
// segundo plano sin que lleguemos a ver el resultado). El pipeline principal
// (server.js) NO tiene este problema porque ya corre los jobs en segundo
// plano con su propio jobId/GET /status — solo el endpoint de prueba directa
// lo necesitaba.
async function submitOperation(productImageUrl, motionPrompt, segDurSeconds = 4, aspectRatio = "9:16") {
  if (!API_KEY) throw new Error("NO_GEMINI_API_KEY: Veo no configurado (no se gasta)");
  const duration = nearestAllowedDuration(segDurSeconds);
  const image = await fetchImageAsBase64(productImageUrl);

  const submitRes = await axios.post(
    `${BASE}/models/${MODEL}:predictLongRunning`,
    {
      instances: [{ prompt: motionPrompt, image: { bytesBase64Encoded: image.data, mimeType: image.mimeType } }],
      parameters: { aspectRatio, resolution: "720p", durationSeconds: duration }
    },
    { headers: { "x-goog-api-key": API_KEY, "Content-Type": "application/json" }, timeout: 30000 }
  );
  const opName = submitRes.data?.name;
  if (!opName) throw new Error("Veo: respuesta sin operation name — " + JSON.stringify(submitRes.data).slice(0, 300));
  return opName;
}

// Revisa una operación existente. Devuelve { done: false } mientras sigue en
// curso, o { done: true, buffer } con el video ya descargado cuando termina.
async function pollOperation(opName) {
  const pollRes = await axios.get(`${BASE}/${opName}`, {
    headers: { "x-goog-api-key": API_KEY },
    timeout: 15000
  });
  if (!pollRes.data?.done) return { done: false };

  if (pollRes.data.error) {
    throw new Error("Veo generation error: " + JSON.stringify(pollRes.data.error).slice(0, 300));
  }
  const videoUri =
    pollRes.data?.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri ||
    pollRes.data?.response?.videos?.[0]?.uri;
  if (!videoUri) throw new Error("Veo: sin video en la respuesta final — " + JSON.stringify(pollRes.data).slice(0, 300));

  // La URI de Veo exige el header x-goog-api-key para descargar (no es una
  // URL pública como fal.ai/Pexels) — se descarga aquí mismo a Buffer.
  const videoRes = await axios.get(videoUri, {
    headers: { "x-goog-api-key": API_KEY },
    responseType: "arraybuffer",
    timeout: 60000
  });
  return { done: true, buffer: Buffer.from(videoRes.data) };
}

// productImageUrl: URL pública de la imagen ya generada (misma que recibe
// falVideo.animateProductUrl) — se reusa el frame FLUX-pro ya validado por QA,
// Veo solo reemplaza el paso de animación, no el de generación de imagen.
// Usado por el pipeline principal (server.js), que YA corre en segundo plano
// (jobId/status) — ahí SÍ es seguro esperar sincrónicamente aquí adentro.
async function animateProductUrl(productImageUrl, motionPrompt, segDurSeconds = 4, aspectRatio = "9:16") {
  const opName = await submitOperation(productImageUrl, motionPrompt, segDurSeconds, aspectRatio);
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 5000));
    const result = await pollOperation(opName);
    if (result.done) return result.buffer;
  }
  throw new Error("Veo: timeout esperando la operación (>3min)");
}

module.exports = { animateProductUrl, submitOperation, pollOperation, isConfigured, nearestAllowedDuration };
