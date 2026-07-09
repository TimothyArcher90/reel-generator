// Voz clonada de Guillermo con Chatterbox Multilingual (Resemble AI, MIT
// open-source) vía fal.ai — MISMA cuenta/FAL_KEY que ya usas para Wan/FLUX/
// Seedance, cero cuenta nueva. Alternativa de bajísimo riesgo a ElevenLabs:
// pago por caracter ($0.025/1000 caracteres, un reel de 45s ≈ 650 caracteres
// ≈ $0.016 — prácticamente gratis), no por suscripción mensual, así que no
// hay forma de "perder plata" en saldo agotado como pasó con ElevenLabs. En
// pruebas ciegas independientes, Chatterbox ganó contra ElevenLabs 65.3% de
// las veces (ver Resemble AI / Hugging Face, julio 2026) — no es una opción
// inferior, es un modelo distinto y muy competitivo.
//
// Usa como referencia de clonación el archivo YA EXISTENTE en el repo,
// pipeline/assets/guillermo_ref.wav (audio real de Guillermo, ya commiteado)
// — no depende de que el usuario suba nada nuevo.
//
// Contrato de API verificado en fal.ai/models/fal-ai/chatterbox/text-to-speech/
// multilingual (no adivinado):
//   input:  { text, language: "spanish", audio_url, exaggeration?, cfg? }
//   output: { audio: { url } }
const { fal } = require("@fal-ai/client");
const fs = require("fs");
const path = require("path");
const axios = require("axios");

const REF_AUDIO_PATH = path.join(__dirname, "assets", "guillermo_ref.wav");
let cachedRefUrl = null; // se sube una sola vez por proceso, se reusa en cada reel

function isConfigured() {
  return !!process.env.FAL_KEY;
}

async function getReferenceAudioUrl() {
  if (cachedRefUrl) return cachedRefUrl;
  if (!fs.existsSync(REF_AUDIO_PATH)) {
    throw new Error(`No se encontró el audio de referencia de Guillermo en ${REF_AUDIO_PATH}`);
  }
  const buffer = fs.readFileSync(REF_AUDIO_PATH);
  const blob = new Blob([buffer], { type: "audio/wav" });
  cachedRefUrl = await fal.storage.upload(blob);
  return cachedRefUrl;
}

async function generateVoiceover(text, outputPath) {
  if (!isConfigured()) throw new Error("NO_FAL_KEY: Chatterbox no configurado (no se gasta)");
  fal.config({ credentials: process.env.FAL_KEY });

  const audioUrl = await getReferenceAudioUrl();
  const result = await fal.subscribe("fal-ai/chatterbox/text-to-speech/multilingual", {
    input: { text, language: "spanish", audio_url: audioUrl },
    logs: false
  });
  const url = result?.data?.audio?.url || result?.audio?.url;
  if (!url) throw new Error("Chatterbox: respuesta sin audio — " + JSON.stringify(result).slice(0, 300));

  const audioRes = await axios.get(url, { responseType: "arraybuffer", timeout: 60000 });
  fs.writeFileSync(outputPath, Buffer.from(audioRes.data));
  return outputPath;
}

module.exports = { generateVoiceover, isConfigured };
