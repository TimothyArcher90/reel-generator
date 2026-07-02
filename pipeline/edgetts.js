const { MsEdgeTTS, OUTPUT_FORMAT } = require("msedge-tts");
const fs = require("fs");

// es-CO-GonzaloNeural: voz masculina colombiana. Gratis, sin API key, sin billing.
const VOICE = process.env.EDGE_TTS_VOICE || "es-CO-GonzaloNeural";

async function generateVoiceover(text, outputPath) {
  const tts = new MsEdgeTTS();
  await tts.setMetadata(VOICE, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);

  // msedge-tts v2: toStream devuelve { audioStream }; v1 devolvía el stream directo
  const result = tts.toStream(text);
  const readable = result && typeof result.pipe === "function" ? result : result.audioStream;
  if (!readable || typeof readable.pipe !== "function") {
    throw new Error("Edge-TTS: no se obtuvo stream de audio (versión de msedge-tts incompatible)");
  }

  return new Promise((resolve, reject) => {
    const writer = fs.createWriteStream(outputPath);
    readable.pipe(writer);
    writer.on("finish", () => resolve(outputPath));
    writer.on("error", (e) => reject(new Error("TTS write error: " + String(e))));
    readable.on("error", (e) => reject(new Error("TTS stream error: " + String(e))));
  });
}

module.exports = { generateVoiceover };
