const axios = require("axios");

// Voz de Guillermo clonada — modelo de comunidad XTTS-v2 (no requiere tarjeta extra)
const VOICE_URL = process.env.RAILWAY_PUBLIC_DOMAIN
  ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}/guillermo-voice.wav`
  : "https://reel-generator-production-5a8d.up.railway.app/guillermo-voice.wav";

async function generateVoiceover(text) {
  const apiKey = process.env.REPLICATE_API_KEY;

  const { data: pred } = await axios.post(
    "https://api.replicate.com/v1/predictions",
    {
      version: "684bc3855b37866c0c65add2ff39c78f3dea3f4ff103a436465326e0f438d55e",
      input: {
        text:          text.slice(0, 2000),
        speaker:       VOICE_URL,
        language:      "es",
        cleanup_voice: false
      }
    },
    {
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      timeout: 30000
    }
  );

  const predId = pred.id;
  if (!predId) throw new Error("XTTS-v2: no prediction id — " + JSON.stringify(pred).slice(0, 200));

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
