const { MsEdgeTTS, OUTPUT_FORMAT } = require("msedge-tts");
const fs = require("fs");

// es-CO-GonzaloNeural: voz masculina colombiana — acento más cercano a Guillermo
const VOICE = process.env.EDGE_TTS_VOICE || "es-CO-GonzaloNeural";

async function generateVoiceover(text, outputPath) {
  const tts = new MsEdgeTTS();
  await tts.setMetadata(VOICE, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

  return new Promise((resolve, reject) => {
    try {
      const readable = tts.toStream(text);
      const writer = fs.createWriteStream(outputPath);
      readable.pipe(writer);
      writer.on("finish", () => resolve(outputPath));
      writer.on("error", (e) => reject(new Error("TTS write error: " + String(e))));
      readable.on("error", (e) => reject(new Error("TTS stream error: " + String(e))));
    } catch (e) {
      reject(new Error("TTS init error: " + String(e)));
    }
  });
}

module.exports = { generateVoiceover };
