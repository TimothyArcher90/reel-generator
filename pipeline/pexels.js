// Video de stock real vía Pexels (100% gratis, sin mínimo, ya con PEXELS_API_KEY
// configurada en Railway). Sirve como respaldo final cuando la generación por IA
// (LTX-Video/Higgsfield) falla — así el reel SIEMPRE se completa con algo real,
// nunca se cae del todo.
const axios = require("axios");

// Mapeo de temas → término de búsqueda curado. Antes se usaba el prompt
// cinematográfico completo tal cual (ej. "Low-angle shot of a glass and steel...")
// y Pexels devolvía resultados irrelevantes/borrosos (un pasillo, equipo de audio
// con marca visible) porque esas palabras de dirección de cámara confunden la
// búsqueda. Ahora se detecta el sujeto real del prompt (ya viene de una lista
// fija en generateScript.js) y se usa un término de búsqueda probado para ese tema.
const TOPIC_QUERIES = [
  { keywords: ["gpu", "rack", "data center", "hyperscale"], query: "server room data center racks" },
  { keywords: ["fiber optic", "cable", "network"], query: "fiber optic cables technology" },
  { keywords: ["chip", "silicon", "wafer", "semiconductor"], query: "microchip circuit board macro" },
  { keywords: ["skyscraper", "financial", "glass and steel"], query: "financial skyscraper glass building" },
  { keywords: ["server", "led", "processing"], query: "server room technology" },
  { keywords: ["robotic arm", "robot", "machinery", "assembling"], query: "robotic arm factory automation" },
  { keywords: ["motherboard", "circuits", "liquidity"], query: "motherboard circuit board technology" },
  { keywords: ["drone", "satellite", "antenna", "aerial"], query: "aerial drone city technology" }
];
const DEFAULT_QUERY = "technology business abstract";

function queryFor(imagePrompt) {
  const lower = (imagePrompt || "").toLowerCase();
  for (const topic of TOPIC_QUERIES) {
    if (topic.keywords.some(k => lower.includes(k))) return topic.query;
  }
  return DEFAULT_QUERY;
}

async function searchVideo(imagePrompt) {
  const key = process.env.PEXELS_API_KEY;
  if (!key) throw new Error("Falta PEXELS_API_KEY en Railway");

  const query = queryFor(imagePrompt);
  const { data } = await axios.get("https://api.pexels.com/videos/search", {
    headers: { Authorization: key },
    params: { query, orientation: "portrait", per_page: 10 },
    timeout: 15000
  });

  const videos = data.videos || [];
  if (!videos.length) throw new Error(`Pexels: sin resultados para "${query}"`);

  // Elegir el video con mayor resolución vertical disponible, priorizando 9:16 y
  // descartando resoluciones muy bajas (esas suelen ser los recortes borrosos).
  let best = null, bestScore = -1;
  for (const v of videos) {
    for (const file of v.video_files || []) {
      if (!file.link || file.height < 720) continue;
      const isVertical = file.height > file.width;
      const score = (isVertical ? 1000000 : 0) + (file.width * file.height);
      if (score > bestScore) { bestScore = score; best = file; }
    }
  }
  if (!best) throw new Error(`Pexels: "${query}" sin archivos de video en buena resolución`);
  return best.link;
}

module.exports = { searchVideo };
