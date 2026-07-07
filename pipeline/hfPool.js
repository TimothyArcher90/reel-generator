// Pool de tokens de Hugging Face para round-robin de cuota ZeroGPU.
//
// HALLAZGO CLAVE (2026-07-07, confirmado en vivo): la cuota gratuita de
// ZeroGPU NO es por Space — es por CUENTA que llama (el HF_TOKEN usado).
// Usar 4 Spaces distintos con el MISMO token sigue drenando el mismo
// presupuesto compartido (video Y voz compiten por él). La única forma real
// de tener más cuota simultánea es tener MÁS DE UN TOKEN (de cuentas gratuitas
// de Hugging Face distintas — crear una cuenta tarda ~2 min, es gratis).
//
// Este módulo permite configurar hasta N tokens vía variables de entorno:
//   HF_TOKEN, HF_TOKEN_2, HF_TOKEN_3, HF_TOKEN_4, ...
// y rota entre ellos automáticamente. Con 1 solo token (estado actual) se
// comporta igual que antes; agregar más tokens en Railway multiplica la cuota
// disponible sin tocar código.
const TOKENS = [
  process.env.HF_TOKEN,
  process.env.HF_TOKEN_2,
  process.env.HF_TOKEN_3,
  process.env.HF_TOKEN_4,
  process.env.HF_TOKEN_5,
].filter(Boolean);

let cursor = 0;

// Devuelve la lista completa (para reintentar con cada uno hasta que uno tenga cuota).
function allTokens() {
  return TOKENS.length ? TOKENS : [undefined]; // undefined = llamada anónima (cuota mínima propia)
}

// Rota el punto de partida en cada llamada externa, así distintos clips no
// siempre empiezan probando el mismo token primero (reparte la carga).
function rotatedTokens() {
  const list = allTokens();
  const start = cursor % list.length;
  cursor++;
  return [...list.slice(start), ...list.slice(0, start)];
}

module.exports = { rotatedTokens, count: () => allTokens().length };
