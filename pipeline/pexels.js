// Video de stock real vía Pexels (100% gratis, sin mínimo, ya con PEXELS_API_KEY
// configurada en Railway). Sirve como respaldo final cuando la generación por IA
// (LTX-Video/Higgsfield) falla — así el reel SIEMPRE se completa con algo real,
// nunca se cae del todo.
const axios = require("axios");

// query: términos de búsqueda en inglés, cortos (ej. "server room data center")
async function searchVideo(query) {
  const key = process.env.PEXELS_API_KEY;
  if (!key) throw new Error("Falta PEXELS_API_KEY en Railway");

  const { data } = await axios.get("https://api.pexels.com/videos/search", {
    headers: { Authorization: key },
    params: { query, orientation: "portrait", per_page: 5 },
    timeout: 15000
  });

  const videos = data.videos || [];
  if (!videos.length) throw new Error(`Pexels: sin resultados para "${query}"`);

  // Elegir el video con mayor resolución vertical disponible, priorizando 9:16
  let best = null, bestScore = -1;
  for (const v of videos) {
    for (const file of v.video_files || []) {
      if (!file.link) continue;
      const isVertical = file.height > file.width;
      const score = (isVertical ? 1000000 : 0) + (file.width * file.height);
      if (score > bestScore) { bestScore = score; best = file; }
    }
  }
  if (!best) throw new Error(`Pexels: "${query}" sin archivos de video utilizables`);
  return best.link;
}

module.exports = { searchVideo };
