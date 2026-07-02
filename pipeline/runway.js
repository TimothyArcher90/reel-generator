const axios = require("axios");
const fs    = require("fs");
const path  = require("path");

// Pexels free stock video — 200 requests/hour, no billing required
// Portrait/9:16 clips for vertical reel format

async function searchPexelsVideo(query) {
  const key = process.env.PEXELS_API_KEY;
  if (!key) throw new Error("PEXELS_API_KEY no configurada");

  const { data } = await axios.get("https://api.pexels.com/videos/search", {
    headers: { Authorization: key },
    params: { query, orientation: "portrait", per_page: 3, size: "medium" },
    timeout: 15000
  });

  if (!data.videos || data.videos.length === 0) {
    // Fallback: búsqueda genérica si no hay resultados
    const { data: fallback } = await axios.get("https://api.pexels.com/videos/search", {
      headers: { Authorization: key },
      params: { query: "business cinematic", orientation: "portrait", per_page: 3 },
      timeout: 15000
    });
    if (!fallback.videos || fallback.videos.length === 0) throw new Error("Pexels: no hay videos para: " + query);
    return getBestVideoFile(fallback.videos[0]);
  }
  return getBestVideoFile(data.videos[0]);
}

function getBestVideoFile(video) {
  // Preferir HD portrait, si no la más alta disponible
  const files = video.video_files || [];
  const portrait = files.filter(f => f.width < f.height);
  const sorted = (portrait.length ? portrait : files).sort((a, b) => b.width - a.width);
  if (!sorted.length) throw new Error("Pexels: video sin archivos descargables");
  return sorted[0].link;
}

async function generateAllClips(prompts, onProgress) {
  const urls = [];
  for (let i = 0; i < prompts.length; i++) {
    onProgress(`Buscando clip ${i + 1}/${prompts.length}...`);
    // Extraer palabras clave del prompt para la búsqueda
    const keywords = extractKeywords(prompts[i]);
    const url = await searchPexelsVideo(keywords);
    urls.push(url);
  }
  return urls;
}

function extractKeywords(prompt) {
  // Tomar las primeras 3-4 palabras descriptivas del prompt
  const stopWords = new Set(["a", "an", "the", "with", "and", "of", "in", "on", "at", "for", "to", "is", "are", "shot", "cinematic", "dramatic", "close-up", "wide", "aerial"]);
  const words = prompt.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(" ").filter(w => w.length > 3 && !stopWords.has(w));
  return words.slice(0, 3).join(" ") || "business professional";
}

module.exports = { generateAllClips };
