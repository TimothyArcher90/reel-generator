// Control de calidad AUTOMÁTICO del guion antes de gastar en voz/video/render.
// Usa Claude Haiku (barato, ya se paga por el guion mismo) como "segundo par
// de ojos" que verifica que el guion generado realmente cumple las reglas
// estrictas del Director Creativo (pedido explícito del usuario: que una IA
// más chica confirme calidad y ordene regenerar si está mal, en vez de dejar
// pasar un guion mediocre/genérico/estático al pipeline caro de video).
const Anthropic = require("@anthropic-ai/sdk");
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function qaScript(script) {
  const prompt = `Eres el Control de Calidad de una agencia de reels virales. Evalúa este guion técnico contra checklist ESTRICTO. Sé exigente — el objetivo es rechazar cualquier guion mediocre antes de gastar en generar video real.

CHECKLIST (cualquier fallo = FAIL):
1. Ningún videoPrompt describe una imagen ESTÁTICA ("a picture of", "an image of", sin movimiento) — todos deben describir movimiento/animación real.
2. Ningún videoPrompt describe un estilo NO fotorrealista ("3D render", "illustration", "vector art", "paper-cut", "cartoon", "animated style") — TODOS deben ser fotografía hiperrealista (regla estricta del usuario, sin excepciones).
3. El hook (captions[0]) genera tensión/curiosidad real, no es una introducción genérica.
4. Cada videoPrompt es específico y visual, no abstracto/vago ("energy", "concept", "power" solos no cuentan).
5. Los videoPrompts varían entre sí (no se repite el mismo sujeto en segmentos consecutivos).
6. Cada caption afirma UN hecho/dato concreto — rechaza cualquier caption que sea reflexión vaga, pregunta retórica sin contenido nuevo, o relleno sin información ("da vueltas sin ir al grano").
7. El cierre (último caption) resuelve la tensión del hook con una conclusión CONCRETA, no es un corte abrupto ni una idea vaga.

GUION A EVALUAR:
${JSON.stringify(script, null, 1).slice(0, 4000)}

Responde SOLO con este JSON (sin markdown):
{"pass": true|false, "issues": ["problema concreto 1", "..."], "fix_instruction": "instrucción corta y concreta para corregir el guion si pass=false, vacío si pass=true"}`;

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 800,
    messages: [{ role: "user", content: prompt }]
  });
  const raw = response.content[0].text.trim();
  const json = raw.replace(/^```json?\n?/, "").replace(/\n?```$/, "");
  return JSON.parse(json);
}

module.exports = { qaScript };
