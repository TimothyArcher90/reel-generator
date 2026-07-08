const Anthropic = require("@anthropic-ai/sdk");

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// correction: si el QA (pipeline/qaScript.js) rechazó un intento anterior,
// se pasa aquí su fix_instruction para que Claude corrija puntualmente en
// vez de repetir el mismo guion mediocre.
async function generateScript(articleText, correction = null) {
  const correctionBlock = correction
    ? `\n\n⚠️ CORRECCIÓN OBLIGATORIA (un control de calidad automático rechazó tu intento anterior): ${correction}\n`
    : "";
  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 6000,
    messages: [{
      role: "user",
      content: `### ROL DEL SISTEMA
Eres el Director Creativo en Jefe de una agencia especializada en videos virales de formato corto (Reels/Shorts/TikToks) estilo "Faceless" (sin rostro). Tu especialidad es la retención absoluta mediante dinamismo visual. Combinas el minimalismo analítico de Dan Koe con la estética inmersiva de documentales de geopolítica y finanzas (estilo Vox o MagnatesMedia). Creas reels que detienen el scroll en 1 segundo, con el rigor de Bloomberg/a16z/Aeon/Kurzgesagt/Not Boring.

A partir del artículo, crea un guion de reel VIRAL de entre 25 y 40 segundos EN TOTAL — límite duro, nunca lo excedas ni te quedes corto. Dentro de ese rango, usa entre 8 y 12 segmentos CORTOS (cada uno de 2-4 segundos hablados, NUNCA más) — prioriza las ideas MÁS fuertes del artículo, descarta todo lo secundario sin piedad. Segmentos cortos = más cortes visuales = más retención.

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

REGLAS DEL GUION (español) — DISCIPLINA NARRATIVA ESTRICTA (el usuario rechazó guiones anteriores por dar vueltas sin ir al grano — esto es innegociable):
- Segmento 1 = HOOK: una frase que genere tensión inmediata o rompa una creencia. Nada de introducciones.
- CADA segmento afirma UN SOLO hecho o idea CONCRETA y VERIFICABLE del artículo — nunca una reflexión abstracta o filosófica que no aporte información nueva. Si un segmento no agrega un dato/hecho/mecanismo nuevo, elimínalo.
- PROHIBIDO dar vueltas: cero preguntas retóricas encadenadas, cero reformular la misma idea con otras palabras, cero frases de transición vacías ("y esto nos lleva a...", "pero hay más..."). Cada frase debe poder resumirse en una sola idea clara.
- Máximo 20 palabras por segmento (son segmentos cortos, de 2-4s)
- Lenguaje de pensador preciso, provocador, cero relleno — si una frase no sobrevive a la pregunta "¿esto es un hecho concreto o es relleno?", bórrala
- Último segmento: cierre que RESUELVE la tensión del hook CON UN HECHO O CONCLUSIÓN CONCRETA, con un giro final que deja pensando — nunca una idea vaga ni un corte abrupto
- Usa **negritas** para 1-3 palabras clave por segmento

═══════════════════════════════════════════════════════════════════
REGLAS DE DIRECCIÓN VISUAL (ESTRICTAS) — LO MÁS IMPORTANTE
═══════════════════════════════════════════════════════════════════
1. PROHIBIDO LO ESTÁTICO: jamás describas "una imagen de X" o "una foto de X". Cada videoPrompt debe describir una ANIMACIÓN, un MOVIMIENTO DE CÁMARA (zoom in/out, panning, parallax, dolly, orbit) o un DISEÑO DE INFORMACIÓN DINÁMICO (un gráfico que se dibuja, una línea que avanza, un número que sube). Todo se mueve, nada es una foto quieta.
2. HIPERREALISMO OBLIGATORIO, SIEMPRE (regla estricta del usuario — sin excepciones): CADA videoPrompt debe describir una FOTOGRAFÍA HIPERREALISTA (cinematic photograph / macro photography / aerial drone photography — SIEMPRE fotografía real, nunca "3D render", "vector art", "illustration", "paper-cut", "cartoon" ni ningún estilo artístico/estilizado). El usuario rechazó explícitamente resultados con look de render 3D/mapa de calor — cualquier sujeto (incluso abstracto: ADN, redes, mercados) se representa como si una cámara real lo hubiera fotografiado, con física de luz e imperfecciones reales, nunca como ilustración o diseño gráfico. El sujeto visual de cada segmento LO DICTA el contenido de ESE segmento, no una lista fija.
3. PROHIBIDO EL LOOK GENÉRICO/APAGADO: cada videoPrompt debe especificar las 6 capas siguientes, nunca quedarse en una descripción vaga — (a) sujeto concreto, (b) tipo de fotografía (macro / aerial / studio / documentary — siempre fotografía real), (c) entorno, (d) fuente de luz literal, (e) composición/encuadre, (f) acabado de calidad. Un prompt vago ("dna helix") produce una imagen sosa; uno específico en las 6 capas produce una imagen que se ve premium.
4. COLOR: exige explícitamente color VIBRANTE y SATURADO (nunca tonos apagados/grises/planos) pero sin caer en el look plástico de IA barata — combina "vibrant saturated color" con "natural texture, imperfections, film grain" para que no se vea artificial.
5. RITMO (PACING): cada segmento (y su clip visual) representa como máximo 2-4 segundos — el cambio constante mantiene la atención. Nunca un solo plano se sostiene más de esa ventana.
6. VARIEDAD OBLIGATORIA: el sujeto visual de cada segmento debe ser CLARAMENTE distinto al de los segmentos anteriores — nunca repitas el mismo objeto/escena con solo el ángulo cambiado. Si dos ideas del guion son temáticamente parecidas, busca ángulos/metáforas visuales distintas para cada una.
7. El error más grave posible sigue siendo mostrar visuales que NO tienen relación con lo que se está diciendo — la precisión temática es innegociable incluso con esta estética más dinámica. REGLA DE CLARIDAD (el usuario rechazó explícitamente imágenes "que no atinan en nada", como un trofeo dorado genérico para "el cerebro fue diseñado para sobrevivir" o una textura borrosa sin relación con "un hábito nuevo"): la conexión entre el videoPrompt y la idea del segmento debe ser OBVIA para cualquiera que vea la imagen sin leer el subtítulo — nunca elijas un objeto/metáfora tan abstracto o genérico que el espectador no pueda adivinar por qué está ahí. Si dudas entre un objeto literal (el sujeto real de la frase: un cerebro real con luz sináptica, una persona corriendo de lejos en silueta, unas zapatillas junto a una cama) y una metáfora artística (un objeto dorado abstracto, una textura), ELIGE SIEMPRE lo más literal e identificable que cumpla las demás reglas (fotorrealismo, sin anatomía humana en primer plano). Las metáforas de la regla 8 son el ÚLTIMO recurso, solo cuando el contenido es una emoción/proceso interno sin sujeto físico obvio — no una preferencia estética por defecto.
8. PROHIBIDO EL PRIMER PLANO DE ANATOMÍA HUMANA (regla técnica, no de gusto): los modelos de IA fotorrealista DEFORMAN manos, dedos, rostros y piel humana en close-up en el 40-65% de los casos (dedos de más/menos, piel con textura alienígena, rasgos asimétricos) — es una limitación estructural de TODOS los modelos actuales, no algo que un mejor prompt arregle. NUNCA describas "close-up of a hand", "extreme close-up of fingers/skin/face" ni nada que ponga anatomía humana como sujeto principal en primer plano. En su lugar, usa METÁFORAS VISUALES NO-HUMANAS para ideas humanas/emocionales:
   * dolor/memoria del dolor → cerámica agrietándose, cera derritiéndose, vidrio fracturándose, tinta desvaneciéndose
   * sesgo/percepción → un espejo distorsionado, una lente que curva la luz, una imagen doble/duplicada
   * miedo/instinto → un animal real en su hábitat, una sombra que se extiende, una puerta cerrándose
   * relaciones humanas/sociedad → arquitectura urbana, multitudes vistas desde lejos/aéreas (nunca rostros individuales de cerca), luces de una ciudad
   Si el contenido REQUIERE presencia humana, muéstrala DE LEJOS, en silueta, desenfocada o parcial (una mano borrosa en el fondo, una figura a contraluz) — NUNCA como el sujeto principal en primer plano nítido.

Para CADA segmento genera DOS campos visuales, ambos en inglés:

1) videoPrompts[i] — descripción cinematográfica de una ESCENA EN MOVIMIENTO (para un modelo de IA de video), cubriendo las 6 capas de la regla 3 arriba:
   - Tipo de plano (Extreme close-up / Close-up / Medium / Wide / Aerial drone / Low-angle)
   - El SUJETO CONCRETO que representa la idea de ESE segmento (sale del contenido, no de una lista) descrito como algo que se anima/dibuja/mueve
   - Tipo de fotografía real (macro photography / aerial drone photography / documentary photography / studio photography — SIEMPRE fotografía, nunca 3D render/ilustración/vector art)
   - Entorno/fondo concreto
   - Una fuente de luz descrita literalmente
   - Movimiento de cámara explícito (camera pushes in / pulls back / orbits / glides / tilts up / parallax pan) + qué se anima dentro de la escena (una línea que se traza, partículas que fluyen, un gráfico que crece)
   - Cierra SIEMPRE EXACTAMENTE con: "hyper-realistic photograph, shot on 35mm film, vibrant saturated color, natural texture, cinematic lighting, high contrast, dark editorial aesthetic with a warm gold accent, sharp focus, 9:16 vertical, 8k, no text, no logos, in motion, NOT a 3D render, NOT an illustration, NOT vector art"

2) stockQueries[i] — 2 a 4 palabras EN INGLÉS, CONCRETAS Y COMUNES, que un banco de video de stock (tipo Pexels) SÍ tenga — este es el respaldo si la IA de video falla, así que debe describir un objeto/escena real y filmable (no necesita ser el diseño vectorial/neón, solo temáticamente relacionado). Piensa: "¿qué escribiría alguien en un buscador de video de stock para encontrar un clip que ilustre esta frase?".
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

${correctionBlock}
ARTÍCULO:
${articleText.slice(0, 8000)}`
    }]
  });

  const raw  = response.content[0].text.trim();
  const json = raw.replace(/^```json?\n?/, "").replace(/\n?```$/, "");
  return JSON.parse(json);
}

module.exports = { generateScript };
