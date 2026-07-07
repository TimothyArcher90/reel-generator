// Subtítulos incrustados estilo "template" del usuario (2026-07-07): fuente
// serif elegante (Playfair Display, empaquetada en pipeline/fonts/ para no
// depender de qué fuentes tenga instaladas el contenedor de Railway), texto
// centrado, caja semitransparente detrás, y la(s) palabra(s) clave de cada
// segmento (marcadas **así** por Claude en generateScript.js) resaltadas en
// dorado cursivo — el resto en blanco. Un evento de subtítulo por segmento
// de guion, sincronizado con el tiempo real que ocupa ese segmento en el
// audio (mismo cálculo proporcional por longitud de texto que ya usa
// server.js para el ritmo de los clips visuales).

const path = require("path");

const GOLD_BGR = "37AFD4"; // ASS usa BGR — esto es dorado (RGB ~ D4AF37)

function assTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h}:${String(m).padStart(2, "0")}:${s.toFixed(2).padStart(5, "0")}`;
}

// Convierte "texto **clave** texto" (markdown simple de generateScript.js) a
// texto con tags ASS: la parte marcada en dorado cursivo, el resto en blanco.
function mdToAssText(caption) {
  const parts = caption.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return parts.map(p => {
    const m = p.match(/^\*\*([^*]+)\*\*$/);
    if (m) return `{\\c&H${GOLD_BGR}&\\i1}${m[1]}{\\r}`;
    return p;
  }).join("");
}

// captions: array de segmentos (texto con **negritas**). segmentDurations:
// array paralelo con la duración estimada (segundos) de cada segmento.
function buildAss({ captions, segmentDurations, fontName = "Playfair Display", fontSize = 46 }) {
  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: 720
PlayResY: 1280
WrapStyle: 1
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${fontName},${fontSize},&H00FFFFFF,&H000000FF,&H00000000,&H60000000,0,0,0,0,100,100,0,0,3,0,0,5,70,70,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
  let t = 0;
  const events = captions.map((cap, i) => {
    const dur = segmentDurations[i];
    const start = t;
    const end = t + dur;
    t = end;
    const text = mdToAssText(cap);
    return `Dialogue: 0,${assTime(start)},${assTime(end)},Default,,0,0,0,,${text}`;
  }).join("\n");
  return header + events + "\n";
}

const FONTS_DIR = path.join(__dirname, "fonts");

module.exports = { buildAss, FONTS_DIR };
