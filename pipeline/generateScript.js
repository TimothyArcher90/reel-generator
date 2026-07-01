const Anthropic = require("@anthropic-ai/sdk");

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function generateScript(articleText) {
  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2000,
    messages: [{
      role: "user",
      content: `Eres un director creativo experto en contenido viral para TikTok, Instagram Reels y YouTube Shorts.

A partir del siguiente artículo, crea un guion de reel de 30-50 segundos. El número de segmentos debe ser el necesario para cubrir las ideas principales (entre 4 y 8 segmentos).

REGLAS:
- Máximo 35 palabras por segmento (el lector debe poder leerlo en ~6 segundos)
- Lenguaje poderoso, directo, filosófico. No genérico.
- El segmento 2 debe tener la idea más disruptiva o provocadora
- Último segmento: cierre que golpea, que invite a quedarse pensando
- Usa **negritas** para las 1-3 palabras más importantes de cada segmento

TAMBIÉN genera un prompt de video por segmento para Higgsfield:
- Estilo: cinematic, abstracto, sin humanos, sin texto, paleta oscura con dorados/ámbar
- Cada prompt específico al tema del segmento
- Formato 9:16 vertical, movimiento lento y majestuoso

RESPONDE SOLO con este JSON (sin markdown, sin explicaciones):
{
  "title": "Título corto del reel",
  "lang": "es",
  "voiceover": "El texto completo para voz en off, con puntuación natural para pausas",
  "captions": ["Segmento 1 con **palabras clave**", "Segmento 2", "..."],
  "videoPrompts": ["Prompt detallado para clip 1...", "..."]
}

El array captions y videoPrompts deben tener el MISMO número de elementos.

ARTÍCULO:
${articleText.slice(0, 8000)}`
    }]
  });

  const raw  = response.content[0].text.trim();
  const json = raw.replace(/^```json?\n?/, "").replace(/\n?```$/, "");
  return JSON.parse(json);
}

module.exports = { generateScript };
