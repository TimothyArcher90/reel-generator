const axios = require("axios");

// Voz de Guillermo clonada — Chatterbox (Resemble AI), mejor calidad que XTTS-v2, modelo comunidad
const VOICE_URL = process.env.RAILWAY_PUBLIC_DOMAIN
  ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}/guillermo-voice.wav`
  : "https://reel-generator-production-5a8d.up.railway.app/guillermo-voice.wav";

async function generateVoiceover(text) {
  const apiKey = process.env.REPLICATE_API_KEY;

  const { data: pred } = await axios.post(
    "https://api.replicate.com/v1/predictions",
    {
      version: "1b8422bc49635c20d0a84e387ed20879c0dd09254ecdb4e75dc4bec10ff94e97",
      input: {
        prompt:       text.slice(0, 2000),
        audio_prompt: VOICE_URL,
        exaggeration: 0.5,
        cfg_weight:   0.5,
        temperature:  0.7
      }
    },
    {
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      timeout: 30000
    }
  );

  const predId = pred.id;
  if (!predId) throw new Error("Chatterbox: no prediction id — " + JSON.stringify(pred).slice(0, 200));

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
