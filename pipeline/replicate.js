const axios = require("axios");

// Voz de Guillermo clonada en MiniMax (Speech-02 HD) — la única confirmada que suena
// a él. Requiere tarjeta débito/crédito en Replicate (modelo "partner oficial").
const GUILLERMO_VOICE_ID = process.env.GUILLERMO_VOICE_ID || "R8_5WN1DFXN";

async function generateVoiceover(text) {
  const apiKey = process.env.REPLICATE_API_KEY;

  const { data: pred } = await axios.post(
    "https://api.replicate.com/v1/models/minimax/speech-02-hd/predictions",
    {
      input: {
        text,
        voice_id:              GUILLERMO_VOICE_ID,
        speed:                 1,
        volume:                1,
        pitch:                 0,
        emotion:               "neutral",
        language_boost:        "Spanish",
        english_normalization: false
      }
    },
    {
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      timeout: 30000
    }
  );

  const predId = pred.id;
  if (!predId) throw new Error("MiniMax TTS: no prediction id — " + JSON.stringify(pred).slice(0, 200));

  const start = Date.now();
  while (Date.now() - start < 300000) {
    await sleep(4000);
    const { data: status } = await axios.get(
      `https://api.replicate.com/v1/predictions/${predId}`,
      { headers: { Authorization: `Bearer ${apiKey}` }, timeout: 15000 }
    );
    if (status.status === "succeeded") {
      const url = typeof status.output === "string" ? status.output : status.output?.[0];
      if (!url) throw new Error("MiniMax TTS: succeeded pero sin output");
      return url;
    }
    if (status.status === "failed") {
      throw new Error("MiniMax TTS falló: " + (status.error || "").slice(0, 200));
    }
  }
  throw new Error("MiniMax TTS timeout");
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

module.exports = { generateVoiceover };
