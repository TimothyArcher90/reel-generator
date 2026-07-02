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

IDIOMAS — REGLA ESTRICTA, DOS CAMPOS EN DOS IDIOMAS DISTINTOS:
- "title", "voiceover" y "captions": 100% ESPAÑOL. Cero palabras en inglés, cero mezcla. Ni siquiera términos técnicos en inglés si existe equivalente en español.
- "videoPrompts": 100% INGLÉS (van a un modelo de video que solo entiende inglés).
- NUNCA mezcles los dos idiomas dentro del mismo campo.

REGLAS DEL GUION (español):
- Segmento 1 = HOOK: una frase que genere tensión inmediata o rompa una creencia. Nada de introducciones.
- Máximo 30 palabras por segmento
- Lenguaje de trader/filósofo: preciso, provocador, cero relleno
- Último segmento: cierre que RESUELVE la tensión planteada en el hook, con un giro final que deja pensando — no lo dejes abierto ni cortado, debe sentirse como una conclusión intencional
- Usa **negritas** para 1-3 palabras clave por segmento

REGLAS DE LOS VIDEO PROMPTS (inglés — van a un modelo text-to-video de alta gama):
- CADA prompt debe representar VISUALMENTE el concepto específico de SU segmento — extrae el sustantivo o metáfora concreta de ese caption exacto (ej. si el segmento habla de "tasas de interés cayendo", el shot debe sugerir descenso/caída/presión, no una imagen genérica intercambiable con cualquier otro segmento)
- Cada prompt: 40-70 palabras con esta estructura exacta:
  [SHOT TYPE] + [SUBJECT con detalle específico ligado al contenido del segmento] + [MOVEMENT de cámara] + [LIGHTING] + [MOOD/GRADE]
- Estética: dark premium tech-finance. Piensa: servidores con luz ámbar, hologramas de datos, ciudades financieras nocturnas, macro de circuitos, tinta en agua, oro líquido, gráficos volumétricos flotando en negro — pero SIEMPRE adaptado al concepto específico del segmento, no genérico
- PROHIBIDO: personas reconocibles, texto en pantalla, logos, imágenes genéricas de oficina, repetir el mismo sujeto visual en dos segmentos distintos
- Cada prompt DEBE ser visualmente distinto al anterior (variar shot type: macro, aerial, dolly-in, orbit, slow push)
- El prompt 1 (opening) debe ser el más espectacular: es lo que detiene el scroll
- El ÚLTIMO prompt debe ser un plano de RESOLUCIÓN/CIERRE VISUAL: convergencia, revelación, o un movimiento de cámara (ej. pull-back, reveal) que transmita conclusión — coordinado con el cierre narrativo del último segmento
- Termina cada prompt con: "cinematic lighting, shallow depth of field, 9:16 vertical, photorealistic, 8k, moody color grade"

EJEMPLO de prompt correcto (para un segmento sobre "el capital rota, no desaparece"):
"Extreme macro shot of molten gold continuously flowing and rerouting through branching circuit pathways etched in black silicon, camera slowly orbiting to reveal the metal never pooling but always redirecting to new channels, amber light refracting through the liquid metal in motion, cinematic lighting, shallow depth of field, 9:16 vertical, photorealistic, 8k, moody color grade"

RESPONDE SOLO con este JSON (sin markdown):
{
  "title": "Título corto del reel EN ESPAÑOL",
  "lang": "es",
  "voiceover": "Texto completo para voz en off EN ESPAÑOL, puntuación natural para pausas",
  "captions": ["Segmento 1 EN ESPAÑOL con **palabras clave**", "..."],
  "videoPrompts": ["prompt EN INGLÉS ligado al segmento 1...", "..."]
}

captions y videoPrompts deben tener el MISMO número de elementos, y cada videoPrompts[i] debe corresponder visualmente a captions[i].

ARTÍCULO:
${articleText.slice(0, 8000)}`
    }]
  });

  const raw  = response.content[0].text.trim();
  const json = raw.replace(/^```json?\n?/, "").replace(/\n?```$/, "");
  return JSON.parse(json);
}

module.exports = { generateScript };
