// Clonación de voz REAL y gratuita vía el Space público de Hugging Face
// "mrfakename/E2-F5-TTS" (modelo open-source F5-TTS, corre en ZeroGPU real
// A10G — no CPU). Reemplaza el intento anterior con myshell-ai/OpenVoiceV2:
// ese Space corría Gradio 3.48 (2023), un protocolo de API incompatible con
// la librería @gradio/client actual (llama a /config/info, una ruta que solo
// existe en Gradio 4/5 — confirmado con fetch instrumentado mostrando el 404
// real). F5-TTS corre Gradio 5.39, totalmente compatible, y conecta y genera
// audio real en ~7-8s en la prueba en vivo.
//
// Contrato de API verificado en vivo el 2026-07-07 leyendo el /config real
// del Space (api_name "predict", nunca adivinado):
//   inputs:  [reference_audio (file), reference_text (string, "" = auto-
//             transcribe con Whisper), generation_text (string), remove_silence (bool)]
//   outputs: [generated_speech (file)]
//
// Es un recurso ZeroGPU gratuito compartido por toda la comunidad (mismo tipo
// de cuota que ya usa pipeline/ltxSpace.js) — la latencia puede variar, así
// que el caller SIEMPRE debe usar un timeout acotado y caer a Edge-TTS si no
// responde a tiempo.
const path = require("path");
const axios = require("axios");
const fs = require("fs");
const { Client, handle_file } = require("@gradio/client");

const SPACE_ID = "mrfakename/E2-F5-TTS";
const DEFAULT_REF_AUDIO = path.join(__dirname, "assets", "guillermo_ref.wav");

function clientOptions() {
  const token = process.env.HF_TOKEN;
  return token ? { hf_token: token } : {};
}

// text: texto a generar (español). refAudioPath: wav de referencia de la voz
// a clonar. refText: transcripción exacta de lo que dice el audio de
// referencia — "" deja que el Space la transcriba solo con Whisper.
async function cloneVoice(text, { refAudioPath = DEFAULT_REF_AUDIO, refText = "" } = {}) {
  const client = await Client.connect(SPACE_ID, clientOptions());
  const result = await client.predict("/predict", [
    handle_file(refAudioPath),
    refText,
    text,
    false, // remove_silence
  ]);
  const audioOut = result.data && result.data[0];
  const url = audioOut && audioOut.url;
  if (!url) throw new Error("F5-TTS: respuesta sin audio utilizable");
  return url;
}

async function downloadTo(url, destPath) {
  const { data } = await axios.get(url, { responseType: "arraybuffer", timeout: 30000 });
  fs.writeFileSync(destPath, data);
}

module.exports = { cloneVoice, downloadTo, DEFAULT_REF_AUDIO };
