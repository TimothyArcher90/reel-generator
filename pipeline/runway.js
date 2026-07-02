const axios = require("axios");

async function searchPexels(query) {
  const key = process.env.PEXELS_API_KEY;
  const { data } = await axios.get("https://api.pexels.com/videos/search", {
    headers: { Authorization: key },
    params: { query, orientation: "portrait", per_page: 3, size: "medium" },
    timeout: 10000
  });
  const videos = data.videos?.length ? data.videos : await fallback(key);
  return bestFile(videos[0]);
}

async function fallback(key) {
  const { data } = await axios.get("https://api.pexels.com/videos/search", {
    headers: { Authorization: key },
    params: { query: "business professional", orientation: "portrait", per_page: 3 },
    timeout: 10000
  });
  return data.videos || [];
}

function bestFile(video) {
  const files = (video.video_files || []).filter(f => f.width < f.height);
  const sorted = (files.length ? files : video.video_files || []).sort((a, b) => b.width - a.width);
  return sorted[0]?.link || sorted[0]?.url;
}

function keywords(prompt) {
  const stop = new Set(["a","an","the","with","and","of","in","on","at","for","to","is","are","shot","cinematic","dramatic","close","wide","aerial","slow","motion"]);
  return prompt.toLowerCase().replace(/[^a-z0-9 ]/g," ").split(" ")
    .filter(w => w.length > 3 && !stop.has(w)).slice(0,3).join(" ") || "business";
}

async function generateAllClips(prompts, onProgress) {
  const urls = [];
  for (let i = 0; i < prompts.length; i++) {
    onProgress(`Buscando clip ${i + 1} de ${prompts.length}...`);
    urls.push(await searchPexels(keywords(prompts[i])));
  }
  return urls;
}

module.exports = { generateAllClips };
