// Clonación de voz REAL y gratuita vía el Space público de Hugging Face
// "hasanbasbunar/Voice-Cloning-XTTS-v2" (modelo XTTS-v2, multilingüe real con
// soporte explícito de español — a diferencia de F5-TTS, que se probó primero
// y sonó con acento extraño/afrancesado porque su modelo base es inglés-
// céntrico sin fonemas de español entrenados). XTTS-v2 tiene un selector de
// idioma explícito ("Spanish") que activa su manejo de fonemas en español,
// resultando en pronunciación mucho más natural.
//
// Contrato de API verificado en vivo el 2026-07-07 leyendo el /config real
// del Space (api_name "voice_clone_synthesis", nunca adivinado). Importante:
// el input de audio de referencia es una URL pública, no un archivo subido —
// por eso el wav de Guillermo (pipeline/assets/guillermo_ref.wav) también se
// sirve desde su URL raw de GitHub en el repo público.
//
// Recurso ZeroGPU gratuito compartido por la comunidad — latencia variable,
// por eso el caller SIEMPRE debe usar timeout acotado + fallback a Edge-TTS.
const axios = require("axios");
const fs = require("fs");
const { Client } = require("@gradio/client");
const hfPool = require("./hfPool");

const SPACE_ID = "hasanbasbunar/Voice-Cloning-XTTS-v2";
// El usuario comparó 3 variantes escuchándolas en vivo (2026-07-07): referencia
// completa (41.6s) + temperature=0.3 (más fiel, menos variación creativa) +
// gpt_cond_len=50 (máximo) sonó más natural que las otras combinaciones —
// aunque el usuario confirmó que sigue sin ser 100% la identidad de Guillermo
// (limitación real de fidelidad de este modelo/Space gratuito, no un bug —
// ver commit de este cambio). Se dejan estos como default de producción.
const DEFAULT_REF_AUDIO_URL = "https://raw.githubusercontent.com/TimothyArcher90/reel-generator/main/pipeline/assets/guillermo_ref_full.wav";

function isQuotaOrTransientError(e) {
  const msg = (e && e.message) || String(e);
  return /quota|RuntimeError|timeout|ZeroGPU|Connection/i.test(msg);
}

// text: español. refAudioUrl: URL pública del wav de referencia (Guillermo por defecto).
// Rota entre todos los tokens HF disponibles (pipeline/hfPool.js) — la cuota
// de ZeroGPU es por cuenta, no por Space, y compite con la de video; con más
// de un token configurado (HF_TOKEN_2, _3, _4...) hay más presupuesto real.
async function cloneVoice(text, { refAudioUrl = DEFAULT_REF_AUDIO_URL, language = "Spanish", temperature = 0.3, gptCondLen = 50 } = {}) {
  const tokens = hfPool.rotatedTokens();
  let lastError;
  for (const token of tokens) {
    try {
      const client = await Client.connect(SPACE_ID, token ? { hf_token: token } : {});
      const result = await client.predict("/voice_clone_synthesis", [
        text,
        refAudioUrl,
        null, // example_audio_name — debe ir vacío cuando se usa reference_audio_url
        language,
        temperature,
        1,    // speed
        true, // do_sample
        5,    // repetition_penalty
        1,    // length_penalty
        gptCondLen,
        50,   // top_k
        0.85, // top_p
        true, // remove_silence
        -45,  // silence_thresh
        300,  // min_silence_len
        100,  // keep_silence
        "Native XTTS splitting",
        250,  // max_chars
        false // enable_preprocessing
      ]);
      const audioOut = result.data && result.data[0];
      const url = audioOut && audioOut.url;
      if (!url) throw new Error("XTTS-v2: respuesta sin audio utilizable");
      return url;
    } catch (e) {
      lastError = e;
      if (!isQuotaOrTransientError(e)) throw e;
    }
  }
  throw lastError || new Error("XTTS-v2: sin tokens disponibles");
}

async function downloadTo(url, destPath) {
  const { data } = await axios.get(url, { responseType: "arraybuffer", timeout: 30000 });
  fs.writeFileSync(destPath, data);
}

module.exports = { cloneVoice, downloadTo, DEFAULT_REF_AUDIO_URL };
