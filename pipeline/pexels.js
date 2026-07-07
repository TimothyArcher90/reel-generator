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
// Cada query de abajo fue DESCARGADA Y REVISADA visualmente (no solo listada)
// antes de dejarla — varias consultas "obvias" (server room, fiber optic cables,
// data center racks) resultaron en videos totalmente ajenos al tema (una bodega
// de cajas, pulseras de tela, alguien tecleando) y se descartaron. Solo quedan
// las que se confirmaron con imagen real coherente y de alta calidad.
const TOPIC_QUERIES = [
  { keywords: ["skyscraper", "financial", "glass and steel"], query: "financial skyscraper glass building" }, // verificado: rascacielos reales, ángulo bajo, cielo azul
  { keywords: ["robotic arm", "robot", "machinery", "assembling"], query: "robotic arm factory automation" }, // verificado: brazo robótico industrial real
  // Todo lo demás (servidores, fibra óptica, chips, placas, drones) usa esta
  // consulta única verificada — un render abstracto tech de alta calidad,
  // coherente con la marca, en vez de arriesgar términos literales sin probar.
  { keywords: ["gpu", "rack", "data center", "server", "fiber optic", "cable", "network", "chip", "silicon", "wafer", "semiconductor", "motherboard", "circuits", "drone", "satellite", "antenna", "aerial", "led", "processing"], query: "computer hardware close up technology" }
];
const DEFAULT_QUERY = "computer hardware close up technology";

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

  // Un archivo vertical de buena resolución por cada video de la búsqueda,
  // descartando resoluciones muy bajas (esas suelen ser los recortes borrosos).
  const candidates = [];
  for (const v of videos) {
    let bestFile = null, bestScore = -1;
    for (const file of v.video_files || []) {
      if (!file.link || file.height < 720) continue;
      const isVertical = file.height > file.width;
      const score = (isVertical ? 1000000 : 0) + (file.width * file.height);
      if (score > bestScore) { bestScore = score; bestFile = file; }
    }
    if (bestFile) candidates.push(bestFile);
  }
  if (!candidates.length) throw new Error(`Pexels: "${query}" sin archivos de video en buena resolución`);

  // Elegir al azar entre los mejores resultados (no siempre el mismo) para que
  // varios segmentos con la misma query no repitan el idéntico clip de stock.
  const top = candidates.slice(0, 5);
  return top[Math.floor(Math.random() * top.length)].link;
}

module.exports = { searchVideo };
