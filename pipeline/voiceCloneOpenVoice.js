// Clonación de voz REAL y gratuita vía el Space público de Hugging Face
// "myshell-ai/OpenVoiceV2" (modelo open-source OpenVoice V2, MIT license,
// clona cualquier voz a partir de un audio de referencia corto).
//
// Contrato de API verificado en vivo el 2026-07-07 leyendo el /config real del
// Space (nunca adivinado): la función de síntesis es la dependency índice 1
// (api_name no está expuesto con nombre, así que se llama por fn_index),
// inputs en este orden exacto:
//   [0] Text Prompt   (string)
//   [1] Style         (dropdown: "es_default" para español, "en_us", etc.)
//   [2] Reference Audio (archivo — voz a clonar)
//   [3] Agree         (boolean, checkbox de licencia MIT — debe ir en true)
// outputs: [0] Info (string), [1] Synthesised Audio (archivo), [2] Reference Audio Used
//
// El Space corre en hardware "cpu-basic" (SIN GPU) — la síntesis es más lenta
// que un modelo con GPU dedicada, y es un recurso gratuito compartido por toda
// la comunidad de Hugging Face, así que la latencia real puede variar bastante.
// Por eso esta función SIEMPRE debe llamarse con un timeout acotado desde el
// caller y con un fallback (Edge-TTS) listo, igual que ya se hace con
// LTX-Video y Pollinations — nunca debe poder colgar el pipeline.
const path = require("path");
const axios = require("axios");
const { Client, handle_file } = require("@gradio/client");

const SPACE_ID = "myshell-ai/OpenVoiceV2";
const DEFAULT_REF_AUDIO = path.join(__dirname, "assets", "guillermo_ref.wav");

function clientOptions() {
  const token = process.env.HF_TOKEN;
  return token ? { hf_token: token } : {};
}

// text: español. style: por defecto "es_default". refAudioPath: wav local de
// referencia (por defecto la voz de Guillermo ya incluida en el repo).
async function cloneVoice(text, { style = "es_default", refAudioPath = DEFAULT_REF_AUDIO } = {}) {
  const client = await Client.connect(SPACE_ID, clientOptions());
  const result = await client.predict(1, [
    text,
    style,
    handle_file(refAudioPath),
    true, // Agree — obligatorio, sin esto el Space rechaza la petición
  ]);
  const audioOut = result.data && result.data[1];
  const url = audioOut && (audioOut.url || (audioOut.path && `${SPACE_ID}/file=${audioOut.path}`));
  if (!url) throw new Error("OpenVoiceV2: respuesta sin audio utilizable");
  return url;
}

async function downloadTo(url, destPath) {
  const { data } = await axios.get(url, { responseType: "arraybuffer", timeout: 30000 });
  require("fs").writeFileSync(destPath, data);
}

module.exports = { cloneVoice, downloadTo, DEFAULT_REF_AUDIO };
