const Anthropic = require("@anthropic-ai/sdk");

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function generateScript(articleText) {
  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 3000,
    messages: [{
      role: "user",
      content: `Eres director creativo de una productora premium de contenido financiero/tech (nivel: reels de Bloomberg, a16z, Not Boring). Creas reels que detienen el scroll en 1 segundo.

A partir del artículo, crea un guion de reel de 35-50 segundos (5-6 segmentos).

REGLAS DEL GUION:
- Segmento 1 = HOOK: una frase que genere tensión inmediata o rompa una creencia. Nada de introducciones.
- Máximo 30 palabras por segmento
- Lenguaje de trader/filósofo: preciso, provocador, cero relleno
- Último segmento: cierre que deja pensando, con giro
- Usa **negritas** para 1-3 palabras clave por segmento

REGLAS DE LOS VIDEO PROMPTS (los más importantes — van a un modelo text-to-video de alta gama):
- ESCRÍBELOS EN INGLÉS
- Cada prompt: 40-70 palabras con esta estructura exacta:
  [SHOT TYPE] + [SUBJECT con detalle específico] + [MOVEMENT de cámara] + [LIGHTING] + [MOOD/GRADE]
- Estética: dark premium tech-finance. Piensa: servidores con luz ámbar, hologramas de datos, ciudades financieras nocturnas, macro de circuitos, tinta en agua, oro líquido, gráficos volumétricos flotando en negro
- PROHIBIDO: personas reconocibles, texto en pantalla, logos, imágenes genéricas de oficina
- Cada prompt DEBE ser visualmente distinto al anterior (variar shot type: macro, aerial, dolly-in, orbit, slow push)
- El prompt 1 (opening) debe ser el más espectacular: es lo que detiene el scroll
- Termina cada prompt con: "cinematic lighting, shallow depth of field, 9:16 vertical, photorealistic, 8k, moody color grade"

EJEMPLO de prompt correcto:
"Extreme macro shot of molten gold flowing through microscopic circuit pathways etched in black silicon, camera slowly pushing in, amber light refracting through the liquid metal, particles of light rising like embers, cinematic lighting, shallow depth of field, 9:16 vertical, photorealistic, 8k, moody color grade"

RESPONDE SOLO con este JSON (sin markdown):
{
  "title": "Título corto del reel",
  "lang": "es",
  "voiceover": "Texto completo para voz en off, puntuación natural para pausas",
  "captions": ["Segmento 1 con **palabras clave**", "..."],
  "videoPrompts": ["...", "..."]
}

captions y videoPrompts deben tener el MISMO número de elementos.

ARTÍCULO:
${articleText.slice(0, 8000)}`
    }]
  });

  const raw  = response.content[0].text.trim();
  const json = raw.replace(/^```json?\n?/, "").replace(/\n?```$/, "");
  return JSON.parse(json);
}

module.exports = { generateScript };
