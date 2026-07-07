// Imagen generada por IA, 100% gratis, sin API key — image.pollinations.ai.
// A diferencia de un banco de stock (Pexels), la imagen se genera EXACTAMENTE
// a partir del videoPrompt cinematográfico del segmento (el mismo texto rico
// en inglés que ya genera generateScript.js para LTX-Video), así que el
// resultado SIEMPRE está alineado con el contenido real del guion — no es una
// búsqueda por palabras clave contra un catálogo fijo de clips ajenos.
//
// Riesgo real medido (2026-07-07): es un servicio gratuito compartido, igual
// que el ZeroGPU de LTX-Video — la latencia varía entre ~2s y >90s según la
// cola global. Por eso NUNCA se usa sin timeout: si no responde a tiempo, el
// caller debe caer al respaldo de Pexels (igual que ya se hace con LTX-Video).
const axios = require("axios");

async function generateImage(prompt, timeoutMs = 45000) {
  const encoded = encodeURIComponent(prompt.slice(0, 800));
  const seed = Math.floor(Math.random() * 1e9);
  const url = `https://image.pollinations.ai/prompt/${encoded}?width=768&height=1366&nologo=true&seed=${seed}`;
  const { data } = await axios.get(url, { responseType: "arraybuffer", timeout: timeoutMs });
  if (!data || data.length < 5000) throw new Error("Pollinations: imagen vacía o demasiado pequeña");
  return data;
}

module.exports = { generateImage };
