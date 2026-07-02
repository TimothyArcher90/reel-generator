const axios = require("axios");

const VOICE_URL = process.env.RAILWAY_PUBLIC_DOMAIN
  ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}/guillermo-voice.wav`
  : "https://reel-generator-production-5a8d.up.railway.app/guillermo-voice.wav";

async function generateVoiceover(text) {
  const apiKey = process.env.REPLICATE_API_KEY;

  // Start prediction — community models need /v1/predictions + version hash
  const { data: pred } = await axios.post(
    "https://api.replicate.com/v1/predictions",
    {
      version: "e876df565d4d629da440ce5820d1d2c8c2adb963f52e526efc064911f841f85e",
      input: {
        text:          text.slice(0, 2000), // XTTS-v2 tiene límite de longitud
        speaker_wav:   VOICE_URL,
        language:      "es",
        cleanup_voice: false
      }
    },
    {
      headers: {
        Authorization:  `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      timeout: 30000
    }
  );

  const predId = pred.id;
  if (!predId) throw new Error("Replicate: no prediction id: " + JSON.stringify(pred).slice(0, 200));

  // Poll until done
  const start = Date.now();
  while (Date.now() - start < 300000) {
    await sleep(4000);
    const { data: status } = await axios.get(
      `https://api.replicate.com/v1/predictions/${predId}`,
      { headers: { Authorization: `Bearer ${apiKey}` }, timeout: 15000 }
    );
    if (status.status === "succeeded") {
      const url = status.output;
      if (!url) throw new Error("Replicate: succeeded but no output");
      return typeof url === "string" ? url : url[0];
    }
    if (status.status === "failed") {
      throw new Error("Replicate falló: " + (status.error || JSON.stringify(status).slice(0, 200)));
    }
  }
  throw new Error("Replicate timeout");
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

module.exports = { generateVoiceover };
