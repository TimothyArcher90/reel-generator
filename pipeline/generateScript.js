const Anthropic = require("@anthropic-ai/sdk");

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function generateScript(articleText) {
  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 6000,
    messages: [{
      role: "user",
      content: `Eres director creativo de una productora premium de contenido financiero/tech (nivel: reels de Bloomberg, a16z, Not Boring). Creas reels que detienen el scroll en 1 segundo.

A partir del artículo, crea un guion de reel VIRAL de entre 30 y 60 segundos EN TOTAL — este rango es un límite duro, nunca lo excedas ni te quedes corto. Dentro de ese rango, usa MUCHOS segmentos CORTOS (normalmente entre 9 y 14), cada uno de 3-5 segundos hablados — el ritmo rápido de corte es lo que sostiene la retención; un plano de más de 5 segundos se siente lento y pierde al espectador. Prioriza las ideas más fuertes del artículo, descarta lo secundario, no trates de meter todo el artículo si no cabe en 60 segundos.

ESTRATEGIA VIRAL (sin dañar la marca — nada de clickbait engañoso, exageraciones falsas o sensacionalismo barato; la marca es seria, precisa, con autoridad):
- Los primeros 1-2 segundos deben crear un "pattern interrupt": una afirmación que contradiga lo obvio o genere una pregunta inmediata en la cabeza del espectador
- Ritmo ágil: cada segmento debe aportar una idea nueva, sin relleno ni repetición — si dos ideas son similares, fusiónalas o elige la más fuerte
- Mantén un "gap de curiosidad" abierto durante todo el reel (algo que el espectador quiere saber) y ciérralo solo en el último segmento — eso es lo que genera retención hasta el final
- El cierre debe dejar una idea memorable y compartible (algo que alguien citaría o repetiría), no una conclusión genérica
- Precisión ante todo: cada afirmación debe ser fiel al contenido real del artículo — la marca es de autoridad financiera/tech, no de rumores

IDIOMAS — REGLA ESTRICTA, DOS CAMPOS EN DOS IDIOMAS DISTINTOS:
- "title", "voiceover" y "captions": 100% ESPAÑOL. Cero palabras en inglés, cero mezcla. Ni siquiera términos técnicos en inglés si existe equivalente en español.
- "videoPrompts": 100% INGLÉS (van a un modelo de video que solo entiende inglés).
- NUNCA mezcles los dos idiomas dentro del mismo campo.

REGLAS DEL GUION (español):
- Segmento 1 = HOOK: una frase que genere tensión inmediata o rompa una creencia. Nada de introducciones.
- Máximo 30 palabras por segmento
- Lenguaje de trader/filósofo: preciso, provocador, cero relleno
- Último segmento: cierre que RESUELVE la tensión planteada en el hook, con un giro final que deja pensando — no lo dejes abierto ni cortado, debe sentirse como una conclusión intencional, editado como cierre profesional, nunca como un corte abrupto a mitad de idea
- Usa **negritas** para 1-3 palabras clave por segmento

REGLAS VISUALES (inglés — el pipeline genera primero UNA IMAGEN por segmento y luego la ANIMA; por eso hay DOS campos: imagePrompts y motionPrompts. PRIORIDAD MÁXIMA: CERO AMBIGÜEDAD):
El generador interpreta literalmente cada palabra. Cada imagePrompt debe describir UNA sola imagen posible, sin espacio para interpretación.

ENFOQUE VISUAL OBLIGATORIO: TECH. Todos los sujetos deben sentirse de tecnología/cómputo/infraestructura digital — nada de naturaleza genérica (nada de montañas, cascadas, océano, ADN, planetas). Para cada segmento, elige EXACTAMENTE UNO de estos sujetos (no combines, no ofrezcas alternativas con "or"; comprométete a uno solo):
  * Escala / crecimiento de cómputo → una hilera interminable de racks de GPUs en un data center hiperescala, vista en perspectiva hasta el horizonte
  * Conexión / redes / relaciones → una red de cables de fibra óptica reales con luz ámbar viajando por su interior, tendidos entre edificios de una ciudad de noche
  * Riesgo / caída / colapso → un chip de silicio de cerca resquebrajándose, fragmentos cayendo en cámara lenta sobre una superficie oscura
  * Poder / control / concentración → un rascacielos financiero de vidrio y acero fotografiado desde la base mirando hacia arriba
  * Datos / IA / procesamiento → un pasillo de racks de servidores con luces LED ámbar parpadeando en la oscuridad
  * Tiempo / ciclos / iteración → un brazo robótico de precisión repitiendo un mismo movimiento mecánico, visto de cerca
  * Flujo / liquidez de capital → una placa base (motherboard) iluminada desde abajo, con corrientes de luz ámbar recorriendo sus circuitos como ríos
  * Origen / fundamentos → un wafer de semiconductor siendo grabado con luz ultravioleta en una sala limpia
  * Escala infinita / incertidumbre → un dron o satélite sobrevolando una red de antenas/data centers vista desde el aire, de noche
  * Precisión / ingeniería / maquinaria → brazos robóticos industriales de metal ensamblando piezas de hardware con precisión

imagePrompts[i] — la COMPOSICIÓN ESTÁTICA (sin cámara, sin movimiento):
  1. Tipo de plano exacto (elige UNO): "Extreme close-up shot", "Close-up shot", "Medium shot", "Wide shot", "Aerial drone shot", "Low-angle shot"
  2. El sujeto elegido de la lista, con máximo 2 adjetivos de material/color (ej. "dark brushed steel", "amber-lit")
  3. Una sola fuente de luz descrita literalmente (ej. "lit by a single strong light source from the left, casting hard shadows")
  4. Cierra siempre con esta frase exacta: "cinematic lighting, high contrast black-and-white base with a single warm gold/amber accent light source, dark editorial financial-terminal aesthetic, sharp focus, powerful composition, 9:16 vertical, photorealistic, 8k, no text, no logos, no floating particles, no fog, no people"

motionPrompts[i] — SOLO el movimiento (para animar esa imagen):
  - UN solo movimiento de cámara (elige UNO): "camera orbits slowly around the subject", "camera pushes in toward the subject", "camera pulls back from the subject", "camera glides forward over the scene", "camera tilts up along the subject"
  - + UN movimiento interno de la escena en máximo 8 palabras (ej. "waves crash against the rocks", "amber lights pulse through the cables", "gears rotate steadily")

- PROHIBIDO usar palabras abstractas que no describan un objeto físico real: nada de "energy", "flow" (sustantivo suelto), "power" (sustantivo suelto), "essence", "spirit", "concept"
- No repitas el mismo sujeto en dos segmentos distintos
- Cada segmento DEBE usar tipo de plano y movimiento de cámara distintos al del segmento anterior
- El segmento 1 (opening) debe ser el más espectacular e imponente: es lo que detiene el scroll
- El ÚLTIMO motionPrompt debe usar "camera pulls back" o "camera tilts up" para transmitir conclusión/revelación

EJEMPLO correcto (segmento sobre "el capital rota hacia nuevos sectores"):
imagePrompt: "Aerial drone shot of a dense fiber optic cable network with amber light inside the cables, strung between skyscrapers in a night city, lit by the amber glow from within the cables casting hard shadows on the buildings below, cinematic lighting, high contrast black-and-white base with a single warm gold/amber accent light source, dark editorial financial-terminal aesthetic, sharp focus, powerful composition, 9:16 vertical, photorealistic, 8k, no text, no logos, no floating particles, no fog, no people"
motionPrompt: "camera glides forward over the scene, amber light pulses rerouting between buildings"

RESPONDE SOLO con este JSON (sin markdown):
{
  "title": "Título corto del reel EN ESPAÑOL",
  "lang": "es",
  "voiceover": "Texto completo para voz en off EN ESPAÑOL, puntuación natural para pausas",
  "captions": ["Segmento 1 EN ESPAÑOL con **palabras clave**", "..."],
  "imagePrompts": ["composición EN INGLÉS del segmento 1...", "..."],
  "motionPrompts": ["movimiento EN INGLÉS del segmento 1...", "..."]
}

captions, imagePrompts y motionPrompts deben tener el MISMO número de elementos, y cada imagePrompts[i]/motionPrompts[i] debe corresponder visualmente a captions[i].

ARTÍCULO:
${articleText.slice(0, 8000)}`
    }]
  });

  const raw  = response.content[0].text.trim();
  const json = raw.replace(/^```json?\n?/, "").replace(/\n?```$/, "");
  return JSON.parse(json);
}

module.exports = { generateScript };
