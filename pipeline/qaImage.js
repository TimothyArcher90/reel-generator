// Control de calidad AUTOMÁTICO por clip: usa Claude Haiku con visión (barato)
// para revisar la imagen/frame generado antes de aceptarlo en el reel final.
// Pedido explícito del usuario: que una IA más chica confirme que cada pieza
// generada realmente sirve, y si no, el pipeline la regenera solo — nunca
// dejar pasar una imagen genérica/rota/fuera de tema al video final.
const Anthropic = require("@anthropic-ai/sdk");
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// imageBuffer: bytes JPEG/PNG. segmentText: el texto del guion que ese clip debe ilustrar.
async function qaImage(imageBuffer, segmentText) {
  const base64 = imageBuffer.toString("base64");
  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 300,
    messages: [{
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: "image/jpeg", data: base64 } },
        { type: "text", text: `Esta imagen debe ilustrar visualmente esta idea de un reel viral: "${segmentText}".

Evalúa RÁPIDO y con criterio ESTRICTO:
- ¿Es una imagen nítida, de alta calidad, cinematográfica (no borrosa, no rota, no con artefactos raros)?
- ¿PARECE UNA FOTOGRAFÍA REAL (hiperrealista, con luz e imperfecciones reales)? RECHAZA si se ve como render 3D, ilustración, mapa de calor/térmico, arte vectorial o cualquier estilo gráfico/artificial — el usuario exige fotorrealismo estricto, sin excepciones.
- Si la imagen muestra manos, dedos, rostro o piel humana en primer plano: ¿se ve ANATÓMICAMENTE CORRECTA (número normal de dedos, piel con textura humana real, rasgos simétricos)? RECHAZA sin dudar si hay dedos de más/menos, piel con textura extraña/alienígena, o cualquier deformidad — es un fallo común y grave de los modelos de IA.
- ¿Tiene relación temática real con la idea del segmento (no genérica/random)? RECHAZA si alguien que viera SOLO la imagen (sin leer el texto) no podría adivinar de qué está hablando — objetos abstractos/decorativos sin conexión obvia (un trofeo dorado genérico, una textura borrosa sin motivo aparente) cuentan como FAIL aunque estén nítidos y bien iluminados.
- ¿Se ve profesional/atractiva, no barata?

Responde SOLO con este JSON: {"pass": true|false, "reason": "motivo corto"}` }
      ]
    }]
  });
  const raw = response.content[0].text.trim();
  const json = raw.replace(/^```json?\n?/, "").replace(/\n?```$/, "");
  return JSON.parse(json);
}

module.exports = { qaImage };
