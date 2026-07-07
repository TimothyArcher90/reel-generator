const Anthropic = require("@anthropic-ai/sdk");

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function generateScript(articleText) {
  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 6000,
    messages: [{
      role: "user",
      content: `Eres director creativo de una productora premium de contenido intelectual/editorial (nivel: reels de Bloomberg, a16z, Aeon, Kurzgesagt, Not Boring). Creas reels que detienen el scroll en 1 segundo.

A partir del artículo, crea un guion de reel VIRAL de entre 30 y 60 segundos EN TOTAL — límite duro, nunca lo excedas ni te quedes corto. Dentro de ese rango, usa MUCHOS segmentos CORTOS (normalmente entre 9 y 14), cada uno de 3-5 segundos hablados — el ritmo rápido de corte sostiene la retención; un plano de más de 5 segundos se siente lento. Prioriza las ideas más fuertes del artículo, descarta lo secundario.

ESTRATEGIA VIRAL (sin dañar la marca — nada de clickbait engañoso ni sensacionalismo barato; la marca es seria, precisa, con autoridad):
- Los primeros 1-2 segundos deben crear un "pattern interrupt": una afirmación que contradiga lo obvio o genere una pregunta inmediata
- Ritmo ágil: cada segmento aporta una idea nueva, sin relleno ni repetición
- Mantén un "gap de curiosidad" abierto durante todo el reel y ciérralo solo en el último segmento
- El cierre debe dejar una idea memorable y compartible, no una conclusión genérica
- Precisión ante todo: cada afirmación fiel al contenido real del artículo

IDIOMAS — REGLA ESTRICTA:
- "title", "voiceover" y "captions": 100% ESPAÑOL. Cero inglés, cero mezcla.
- "videoPrompts" y "stockQueries": 100% INGLÉS.
- NUNCA mezcles idiomas dentro del mismo campo.

REGLAS DEL GUION (español):
- Segmento 1 = HOOK: una frase que genere tensión inmediata o rompa una creencia. Nada de introducciones.
- Máximo 30 palabras por segmento
- Lenguaje de pensador preciso, provocador, cero relleno
- Último segmento: cierre que RESUELVE la tensión del hook, con un giro final que deja pensando — nunca un corte abrupto
- Usa **negritas** para 1-3 palabras clave por segmento

═══════════════════════════════════════════════════════════════════
REGLAS VISUALES — LO MÁS IMPORTANTE: EL VISUAL DEBE SALIR DEL CONTENIDO REAL
═══════════════════════════════════════════════════════════════════
El error más grave posible es mostrar imágenes que NO tienen relación con lo que se está diciendo. Si el texto habla de ADN, muestra ADN/células/genoma; si habla de mercados, muestra gráficos/dinero; si habla de filosofía o cosmos, muestra cosmos/naturaleza/abstracto. NUNCA fuerces un tema tecnológico si el contenido no lo es. El sujeto visual de cada segmento LO DICTA el contenido de ESE segmento, no una lista fija.

Para CADA segmento genera DOS campos visuales, ambos en inglés:

1) videoPrompts[i] — descripción cinematográfica rica (para un modelo de IA de video):
   - Tipo de plano (Extreme close-up / Close-up / Medium / Wide / Aerial drone / Low-angle)
   - El SUJETO CONCRETO que representa la idea de ESE segmento (sale del contenido, no de una lista)
   - Una fuente de luz descrita literalmente
   - Movimiento de cámara (camera pushes in / pulls back / orbits / glides / tilts up) + un movimiento interno breve
   - Cierra con: "cinematic lighting, high contrast, dark editorial aesthetic with a warm gold accent, sharp focus, 9:16 vertical, photorealistic, 8k, no text, no logos"

2) stockQueries[i] — 2 a 4 palabras EN INGLÉS, CONCRETAS Y COMUNES, que un banco de video de stock (tipo Pexels) SÍ tenga. Debe describir un objeto/escena real y filmable que represente la idea del segmento. Piensa: "¿qué escribiría alguien en un buscador de video de stock para encontrar un clip que ilustre esta frase?".
   Ejemplos de buenos stockQueries según el tema:
     * segmento sobre ADN/genoma → "dna double helix"
     * segmento sobre células/biología → "cells under microscope"
     * segmento sobre mercados/dinero → "stock market chart" o "falling money"
     * segmento sobre cosmos/escala → "galaxy space stars"
     * segmento sobre redes/conexión → "network connections abstract"
     * segmento sobre ciudades/economía → "city aerial night"
     * segmento sobre tecnología/IA → "server room technology"
     * segmento filosófico/abstracto → "abstract flowing ink" o "slow motion water"
   REGLAS de stockQueries: minúsculas, sin signos de puntuación, sin nombres propios, sin palabras abstractas solas ("energy", "power", "concept"), siempre algo VISUAL y filmable.

- Varía los sujetos entre segmentos (no repitas el mismo dos veces seguidas).
- El segmento 1 debe ser el visual más imponente: es lo que detiene el scroll.

RESPONDE SOLO con este JSON (sin markdown):
{
  "title": "Título corto EN ESPAÑOL",
  "lang": "es",
  "voiceover": "Texto completo para voz en off EN ESPAÑOL, puntuación natural para pausas",
  "captions": ["Segmento 1 EN ESPAÑOL con **palabras clave**", "..."],
  "videoPrompts": ["descripción cinematográfica EN INGLÉS del segmento 1...", "..."],
  "stockQueries": ["dna double helix", "..."]
}

captions, videoPrompts y stockQueries deben tener el MISMO número de elementos, y cada uno del segmento i debe corresponder al mismo segmento i.

ARTÍCULO:
${articleText.slice(0, 8000)}`
    }]
  });

  const raw  = response.content[0].text.trim();
  const json = raw.replace(/^```json?\n?/, "").replace(/\n?```$/, "");
  return JSON.parse(json);
}

module.exports = { generateScript };
