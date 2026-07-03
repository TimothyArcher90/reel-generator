const axios = require("axios");
const fs = require("fs");

// Guillermo's real cloned voice (created via ElevenLabs Instant Voice Cloning).
// Falls back to no-op error if not configured — caller should already have
// validated ELEVENLABS_API_KEY/ELEVENLABS_VOICE_ID are set before calling.
const VOICE_ID = process.env.ELEVENLABS_VOICE_ID;
const API_KEY = process.env.ELEVENLABS_API_KEY;

async function generateVoiceover(text, outputPath) {
  if (!API_KEY) throw new Error("ELEVENLABS_API_KEY no configurada en Railway");
  if (!VOICE_ID) throw new Error("ELEVENLABS_VOICE_ID no configurada en Railway (voz clonada de Guillermo)");

  const response = await axios.post(
    `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`,
    {
      text,
      model_id: "eleven_multilingual_v2",
      voice_settings: { stability: 0.75, similarity_boost: 0.85 }
    },
    {
      headers: {
        "xi-api-key": API_KEY,
        "Content-Type": "application/json"
      },
      responseType: "arraybuffer",
      timeout: 120000
    }
  );

  fs.writeFileSync(outputPath, response.data);
  return outputPath;
}

module.exports = { generateVoiceover };
