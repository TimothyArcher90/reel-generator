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

REGLAS DE LOS VIDEO PROMPTS (inglés — van a un modelo text-to-video de alta gama):
- USA UN VOCABULARIO VISUAL CONCRETO Y UNIVERSAL, no inventes metáforas abstractas nuevas por segmento (los modelos de video no las interpretan bien y el resultado sale sin relación con el guion). Para cada segmento, elige el ítem de esta lista que mejor represente su concepto y constrúyele un shot cinematográfico alrededor:
  * Crecimiento / escala / expansión → cordillera montañosa vista desde el aire, o una ciudad extendiéndose hasta el horizonte
  * Conexión / redes / relaciones → red de nodos y líneas de luz sólidas conectando una ciudad de noche (vista aérea real, no holograma)
  * Riesgo / caída / colapso → cascada de agua o rocas cayendo con fuerza, o un edificio/estructura desde un ángulo vertiginoso
  * Poder / control / concentración → rascacielos financiero monumental visto desde abajo, o una bóveda/cámara acorazada de metal macizo
  * Datos / tecnología / IA → servidores/data center con luces intensas, o placas de circuitos vistas de cerca pero con forma clara y sólida
  * Tiempo / ciclos / historia → reloj mecánico de engranajes grandes, o el amanecer/atardecer sobre una ciudad
  * Océano / flujo / liquidez → olas del mar reales (agua, no metal líquido abstracto), vistas desde un dron
  * Origen / fundamentos / biología → hélice de ADN como escultura sólida, o raíces de un árbol gigante
  * Cosmos / incertidumbre / escala infinita → planeta visto desde el espacio, o campo de estrellas con nebulosa
  * Precisión / ingeniería / maquinaria → maquinaria industrial en movimiento, piezas metálicas engranando con precisión
- Cada prompt debe LIGAR el ítem elegido al concepto EXACTO de su segmento (no repitas el mismo ítem en dos segmentos)
- Cada prompt: 40-70 palabras con esta estructura exacta:
  [SHOT TYPE] + [SUBJECT del vocabulario visual, sólido y con presencia física real — nada de hologramas, partículas o niebla] + [MOVEMENT de cámara] + [LIGHTING dramático de alto contraste] + [MOOD/GRADE poderoso]
- Cada prompt DEBE ser visualmente distinto al anterior (variar shot type: medium shot, aerial, dolly-in, orbit, slow push)
- El prompt 1 (opening) debe ser el más espectacular e imponente: es lo que detiene el scroll
- El ÚLTIMO prompt debe ser un plano de RESOLUCIÓN/CIERRE VISUAL: convergencia, revelación, o un movimiento de cámara (ej. pull-back, reveal) que transmita conclusión con fuerza — coordinado con el cierre narrativo del último segmento
- Termina cada prompt con: "cinematic lighting, high contrast, sharp focus, powerful composition, 9:16 vertical, photorealistic, 8k, bold dramatic color grade"

EJEMPLO de prompt correcto (para un segmento sobre "el capital rota hacia nuevos sectores"):
"Aerial tracking shot of a vast night city skyline with glowing amber light trails flowing continuously between skyscrapers along real streets and rail lines, camera slowly gliding forward to reveal the light network constantly rerouting toward new districts rather than fading, strong directional lighting casting deep shadows between buildings, cinematic lighting, high contrast, sharp focus, powerful composition, 9:16 vertical, photorealistic, 8k, bold dramatic color grade"

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
