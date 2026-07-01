const fs   = require("fs");
const path = require("path");

const TEMPLATE = path.join(__dirname, "..", "template", "template.html");

function buildHtml({ clips, captions, audioFile, duration, lang, title }) {
  const tmpl  = fs.readFileSync(TEMPLATE, "utf8");
  const N     = clips.length;
  const D     = 0.5;
  const seg   = duration / N;

  // Transition timestamps (start of each segment)
  const T = Array.from({ length: N + 1 }, (_, i) =>
    Math.round(i * seg * 10) / 10
  );

  // ── Video clips HTML
  const videoClipsHtml = clips.map((src, i) => {
    const track = (i % 2) + 1;
    const start = Math.max(0, Math.round((T[i] - D) * 10) / 10);
    const end   = Math.min(duration, Math.round((T[i + 1] + D) * 10) / 10);
    const dur   = Math.round((end - start) * 10) / 10;
    return `      <video id="v${i+1}" class="clip video-bg"
        data-start="${start}" data-duration="${dur}" data-track-index="${track}"
        src="media/${path.basename(src)}" muted playsinline preload="auto"></video>`;
  }).join("\n\n");

  // ── Captions HTML (** → <em>, \n → <br>)
  const captionsHtml = captions.map((text, i) => {
    const start = T[i];
    const dur   = Math.round((T[i + 1] - T[i] - 0.05) * 10) / 10;
    const html  = text
      .replace(/\*\*(.+?)\*\*/g, "<em>$1</em>")
      .replace(/\\n/g, "<br>");
    return `      <div id="t${i+1}" class="clip caption"
           data-start="${start}" data-duration="${dur}" data-track-index="3">
        <div class="caption-inner"><p>${html}</p></div>
      </div>`;
  }).join("\n\n");

  // ── Video GSAP
  const videoGsap = clips.map((_, i) => {
    const fadeInAt  = Math.max(0, Math.round((T[i] - D) * 10) / 10);
    const fadeOutAt = Math.round((T[i + 1] - D) * 10) / 10;
    const killAt    = T[i + 1];
    const isFirst   = i === 0;
    const isLast    = i === N - 1;
    const inDur     = isFirst ? 0.4 : D;
    const outDur    = isLast  ? 0.4 : D;
    let lines = [
      `tl.to("#v${i+1}", { opacity: 1, duration: ${inDur} }, ${fadeInAt});`,
      `tl.to("#v${i+1}", { opacity: 0, duration: ${outDur} }, ${fadeOutAt});`,
    ];
    if (!isLast) lines.push(`tl.set("#v${i+1}", { opacity: 0 }, ${killAt});`);
    return lines.join("\n      ");
  }).join("\n\n      ");

  // ── Caption GSAP
  const captionGsap = captions.map((_, i) => {
    const inAt  = Math.round((T[i] + 0.4) * 10) / 10;
    const outAt = Math.round((T[i + 1] - 0.5) * 10) / 10;
    return [
      `tl.fromTo("#t${i+1}", { opacity:0, y:18 }, { opacity:1, y:0, duration:0.6, ease:"power2.out" }, ${inAt});`,
      `tl.to("#t${i+1}", { opacity:0, y:-10, duration:0.4, ease:"power2.in" }, ${outAt});`,
    ].join("\n      ");
  }).join("\n\n      ");

  return tmpl
    .replace("{{LANG}}",         lang || "es")
    .replace("{{DURATION}}",     duration)
    .replace("{{VIDEO_CLIPS}}",  videoClipsHtml)
    .replace("{{CAPTIONS}}",     captionsHtml)
    .replace("{{AUDIO_FILE}}",   path.basename(audioFile))
    .replace("{{VIDEO_GSAP}}",   videoGsap)
    .replace("{{CAPTION_GSAP}}", captionGsap);
}

module.exports = { buildHtml };
