const Anthropic = require("@anthropic-ai/sdk");

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function generateScript(articleText) {
  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 6000,
    messages: [{
      role: "user",
      content: `Eres director creativo de una productora premium de contenido financiero/tech (nivel: reels de Bloomberg, a16z, Not Boring). Creas reels que detienen el scroll en 1 segundo.

A partir del artículo, crea un guion de reel. EL NÚMERO DE SEGMENTOS LO DECIDE EL CONTENIDO, no una regla fija: usa tantos segmentos como haga falta para cubrir con profundidad las ideas reales del artículo — pueden ser 5, pueden ser 12 o más, sin relleno artificial ni ideas forzadas solo para completar un número. Cada segmento entre 4-8 segundos hablados; la duración total del reel es la suma natural de eso, sin límite superior artificial.

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

REGLAS DE LOS VIDEO PROMPTS (inglés — van a un modelo text-to-video, PRIORIDAD MÁXIMA: CERO AMBIGÜEDAD):
El modelo de video interpreta literalmente cada palabra. Si una palabra admite dos lecturas visuales, el modelo elige la que NO queremos. Por eso cada prompt debe describir UNA sola imagen posible, sin espacio para interpretación.

Para cada segmento, elige EXACTAMENTE UNO de estos sujetos (no combines, no ofrezcas alternativas con "or"; comprométete a uno solo):
  * Crecimiento / escala / expansión → una cordillera montañosa nevada vista desde un dron, extendiéndose hasta el horizonte
  * Conexión / redes / relaciones → una red de cables de fibra óptica reales con luz ámbar viajando por su interior, tendidos entre edificios de una ciudad de noche
  * Riesgo / caída / colapso → una cascada de agua real cayendo con fuerza sobre rocas oscuras
  * Poder / control / concentración → un rascacielos financiero de vidrio y acero fotografiado desde la base mirando hacia arriba
  * Datos / tecnología / IA → un pasillo de racks de servidores con luces LED ámbar parpadeando en la oscuridad
  * Tiempo / ciclos / historia → un reloj mecánico de bronce con engranajes grandes girando, visto de cerca
  * Océano / flujo / liquidez → olas de mar reales rompiendo contra rocas, filmadas desde un dron bajo
  * Origen / fundamentos / biología → una doble hélice de ADN esculpida en metal sólido, iluminada desde un lado
  * Cosmos / incertidumbre / escala infinita → un planeta rocoso visto desde una nave, con estrellas de fondo
  * Precisión / ingeniería / maquinaria → brazos robóticos industriales de metal ensamblando piezas con precisión
- Estructura OBLIGATORIA de cada prompt, en este orden exacto y sin desviarte:
  1. Tipo de plano exacto (elige UNO): "Extreme close-up shot", "Close-up shot", "Medium shot", "Wide shot", "Aerial drone shot", "Low-angle shot"
  2. El sujeto elegido de la lista de arriba, con máximo 2 adjetivos de material/color (ej. "dark brushed steel", "amber-lit")
  3. UN solo verbo de movimiento de cámara (elige UNO): "orbits slowly around", "pushes in toward", "pulls back from", "glides forward over", "tilts up along"
  4. Una sola fuente de luz descrita literalmente (ej. "lit by a single strong light source from the left, casting hard shadows")
  5. Cierra siempre con esta frase exacta, sin modificarla: "cinematic lighting, high contrast, sharp focus, powerful composition, 9:16 vertical, photorealistic, 8k, bold dramatic color grade, no text, no logos, no floating particles, no fog, no people"
- PROHIBIDO usar palabras abstractas o metafóricas que no describan un objeto físico real: nada de "energy", "flow" (como sustantivo suelto), "power" (como sustantivo suelto), "essence", "spirit", "concept". Si necesitas expresar una idea abstracta, tradúcela SIEMPRE al objeto físico concreto de la lista de arriba.
- No repitas el mismo sujeto en dos segmentos distintos
- Cada prompt DEBE usar un tipo de plano y un movimiento de cámara distintos al del prompt anterior
- El prompt 1 (opening) debe ser el más espectacular e imponente: es lo que detiene el scroll
- El ÚLTIMO prompt debe usar "pulls back from" o "tilts up along" para transmitir conclusión/revelación, coordinado con el cierre narrativo del último segmento

EJEMPLO de prompt correcto (para un segmento sobre "el capital rota hacia nuevos sectores"):
"Aerial drone shot of a dense fiber optic cable network with amber light traveling through the cables, strung between skyscrapers in a night city, camera glides forward over the network as the light constantly reroutes toward new buildings, lit by the amber glow from within the cables casting hard shadows on the buildings below, cinematic lighting, high contrast, sharp focus, powerful composition, 9:16 vertical, photorealistic, 8k, bold dramatic color grade, no text, no logos, no floating particles, no fog, no people"

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
