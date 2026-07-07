// Video de stock real vía Pexels (100% gratis, sin mínimo, PEXELS_API_KEY en
// Railway). Respaldo cuando la generación por IA (LTX-Video) falla — pero ahora
// la consulta viene DERIVADA DEL CONTENIDO REAL de cada segmento (campo
// stockQueries que Claude genera por segmento en generateScript.js), no de un
// tema fijo. Así el clip de stock es relevante a lo que se está diciendo.
const axios = require("axios");

// Limpia la consulta: minúsculas, sin puntuación, máximo unas pocas palabras.
function cleanQuery(q) {
  const cleaned = String(q || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ").slice(0, 5).join(" ");
  return cleaned || "abstract technology";
}

async function searchOnce(query, key) {
  const { data } = await axios.get("https://api.pexels.com/videos/search", {
    headers: { Authorization: key },
    params: { query, orientation: "portrait", per_page: 12 },
    timeout: 15000
  });
  const videos = data.videos || [];
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
  return candidates;
}

// query: consulta concreta derivada del contenido (ej. "dna double helix").
async function searchVideo(query) {
  const key = process.env.PEXELS_API_KEY;
  if (!key) throw new Error("Falta PEXELS_API_KEY en Railway");

  const primary = cleanQuery(query);
  let candidates = await searchOnce(primary, key);

  // Si la consulta exacta no da resultados verticales de buena resolución,
  // reintentar con solo las 2 primeras palabras (más genérico), y como último
  // recurso un término abstracto neutro — así nunca se queda sin video.
  if (!candidates.length) {
    const broader = primary.split(" ").slice(0, 2).join(" ");
    if (broader && broader !== primary) candidates = await searchOnce(broader, key);
  }
  if (!candidates.length) {
    candidates = await searchOnce("abstract cinematic background", key);
  }
  if (!candidates.length) throw new Error(`Pexels: sin video utilizable para "${primary}"`);

  // Elegir al azar entre los mejores para que segmentos con consulta parecida no
  // repitan el idéntico clip.
  const top = candidates.slice(0, 6);
  return top[Math.floor(Math.random() * top.length)].link;
}

module.exports = { searchVideo };
