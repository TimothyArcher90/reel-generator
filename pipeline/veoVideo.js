// Animación image->video con Google Veo 3.1 (Gemini API) — alternativa de PAGO
// a fal.ai Wan (pipeline/falVideo.js). Se activa solo si GEMINI_API_KEY está
// configurada en el entorno (Railway) Y USE_VEO=true — nunca gasta sin que el
// usuario lo haya pedido a propósito, misma regla que fal.ai.
//
// Contrato de API verificado en ai.google.dev/gemini-api/docs/veo (no adivinado):
//   POST https://generativelanguage.googleapis.com/v1beta/models/{model}:predictLongRunning
//   body: { instances: [{ prompt, image: { inlineData: { mimeType, data } } }],
//           parameters: { aspectRatio, resolution, durationSeconds } }
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

// productImageUrl: URL pública de la imagen ya generada (misma que recibe
// falVideo.animateProductUrl) — se reusa el frame FLUX-pro ya validado por QA,
// Veo solo reemplaza el paso de animación, no el de generación de imagen.
async function animateProductUrl(productImageUrl, motionPrompt, segDurSeconds = 4, aspectRatio = "9:16") {
  if (!API_KEY) throw new Error("NO_GEMINI_API_KEY: Veo no configurado (no se gasta)");
  const duration = nearestAllowedDuration(segDurSeconds);
  const image = await fetchImageAsBase64(productImageUrl);

  const submitRes = await axios.post(
    `${BASE}/models/${MODEL}:predictLongRunning`,
    {
      instances: [{ prompt: motionPrompt, image: { inlineData: image } }],
      parameters: { aspectRatio, resolution: "720p", durationSeconds: String(duration) }
    },
    { headers: { "x-goog-api-key": API_KEY, "Content-Type": "application/json" }, timeout: 30000 }
  );
  const opName = submitRes.data?.name;
  if (!opName) throw new Error("Veo: respuesta sin operation name — " + JSON.stringify(submitRes.data).slice(0, 300));

  // Poll hasta done=true, máx ~3 min (video de 4-8s suele tardar 30-90s).
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 5000));
    const pollRes = await axios.get(`${BASE}/${opName}`, {
      headers: { "x-goog-api-key": API_KEY },
      timeout: 15000
    });
    if (pollRes.data?.done) {
      if (pollRes.data.error) {
        throw new Error("Veo generation error: " + JSON.stringify(pollRes.data.error).slice(0, 300));
      }
      const videoUri =
        pollRes.data?.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri ||
        pollRes.data?.response?.videos?.[0]?.uri;
      if (!videoUri) throw new Error("Veo: sin video en la respuesta final — " + JSON.stringify(pollRes.data).slice(0, 300));
      // La URI de Veo exige el header x-goog-api-key para descargar (no es una
      // URL pública como fal.ai/Pexels) — se descarga aquí mismo a Buffer, así
      // el resto del pipeline (server.js/renderVideo.js) no necesita saber
      // nada especial: un clip con `buffer` se escribe directo a disco igual
      // que cualquier otro (ver server.js linea ~543, clip.buffer).
      const videoRes = await axios.get(videoUri, {
        headers: { "x-goog-api-key": API_KEY },
        responseType: "arraybuffer",
        timeout: 60000
      });
      return Buffer.from(videoRes.data);
    }
  }
  throw new Error("Veo: timeout esperando la operación (>3min)");
}

module.exports = { animateProductUrl, isConfigured, nearestAllowedDuration };
