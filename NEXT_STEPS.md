# Estado actual (leer esto primero, no el historial de chat)

Repo: github.com/TimothyArcher90/reel-generator (rama main)
URL viva: https://reel-generator-production-5a8d.up.railway.app
Última verificación de salud: HTTP 200 en GET /test tras commit 1657be7.

## Costo actual por reel (confirmado con el usuario, no cambiar sin su OK)
- MAX_PAID_CLIPS = 7 (server.js) — los primeros 7 clips (hook + escenas iniciales)
  usan fal.ai de pago: frame FLUX-pro (~$0.04-0.08) + animación Wan 480p ($0.20)
  = ~$0.24-0.28/clip.
- Costo objetivo del usuario: "al menos $2 por video" → 7 × ~0.28 ≈ $1.96/reel.
  NO subir MAX_PAID_CLIPS sin confirmación explícita (el usuario ya pidió bajarlo
  una vez de $4.20 a ~$2).
- El resto de clips (más allá de los 7 pagados) usan video de stock REAL de
  Pexels como prioridad (no Pollinations) — ver commit 9241cc3.
- MAX_TOTAL_CLIPS = 15 en server.js (clips únicos por reel, sube de 12 porque un
  guion de 40s a 3s/clip necesita hasta 14).

## Bugs reales encontrados y arreglados esta sesión (ver commits en orden)
1. `5f70317` — manos/rostros deformados: la IA no puede generar anatomía humana en
   primer plano de forma confiable (40-65% de fallos, limitación estructural de
   TODOS los modelos). Fix: reglas en generateScript.js/qaScript.js/qaImage.js
   para evitar close-ups de anatomía humana, usar metáforas no-humanas.
2. `d05bfe5` — BUG RAÍZ de "la misma imagen se repite 7 veces": renderVideo.js
   calculaba segDur = duration/N usando el número de clips REALMENTE logrados;
   un catch sin envolver en el fallback de Pexels podía morir silenciosamente a
   mitad del bucle, bajando N, y cada clip restante se estiraba mucho más de 3s.
   Fix: try/catch propio en el fallback + reparto round-robin (después
   reemplazado por cero-repeticiones en 3afee93).
3. `3afee93` — el usuario pidió CERO repeticiones (ni siquiera espaciadas). Fix:
   renderVideo.js ya NO cicla clips — un clip único por slot, siempre, con
   segDur flexible (2.5-4.5s) para cubrir la duración exacta sin repetir nunca.
   También: regla de "claridad visual" (el espectador debe entender la imagen
   sin leer el subtítulo) en generateScript.js/qaScript.js/qaImage.js, y fix de
   que un reintento de imagen tras fallar QA nunca se re-validaba.
4. `9241cc3` — Pollinations (imagen IA gratis) es estructuralmente de baja
   calidad — no hay vía gratis que iguale el video de IA de pago (~$0.09-0.15/
   seg en cualquier proveedor serio, investigado en vivo julio 2026). Fix:
   los clips sin presupuesto de pago ahora intentan Pexels stock real PRIMERO,
   Pollinations solo como respaldo secundario.
5. `cbb1e11` → `1657be7` — ajuste de costo: subido a MAX_PAID_CLIPS=15 (opción
   "todo IA"), luego bajado a 7 tras pedir el usuario que costara ~$2/reel.

## Pendiente / decisión abierta del usuario: LA VOZ DE GUILLERMO
Diagnóstico confirmado en vivo (GET /test-voice): el clon de voz gratuito
(XTTS-v2 vía Hugging Face Space, pipeline/voiceCloneXTTS.js) falla SIEMPRE
ahora mismo — la cuota compartida de ZeroGPU está en 0s, cae en silencio a
Edge-TTS (voz genérica). Solo hay 1 token HF configurado (pipeline/hfPool.js
soporta hasta 5: HF_TOKEN, HF_TOKEN_2..5).

Investigado y descartado: Kokoro-82M (TTS local, gratis, soporta español,
corre en CPU) — NO sirve para esto porque NO CLONA VOCES, solo trae 54 voces
preestablecidas, ninguna es Guillermo. Además requeriría añadir un runtime de
Python al contenedor Node/Railway (cambio de infra, no trivial).

Opciones presentadas al usuario, sin decidir aún:
- (A) Gratis pero frágil: agregar 2-4 tokens HF más (cuentas gratuitas nuevas,
  ~2 min c/u) a HF_TOKEN_2/3/4/5 en Railway — reparte la misma cuota compartida,
  no la elimina.
- (B) Pago pero confiable: ElevenLabs (pipeline/elevenlabs.js YA ESTÁ LISTO en
  código, solo falta configurar ELEVENLABS_API_KEY + ELEVENLABS_VOICE_ID en
  Railway con saldo real, y cambiar `useElevenLabs = false` a `true` en
  server.js línea ~294). ~$5/mes plan Starter, 30k caracteres ≈ 100+ reels.
  Pendiente: confirmar con el usuario si su cuenta de ElevenLabs tiene saldo
  (la memoria de sesiones anteriores dice que se desactivó por saldo
  insuficiente) — el usuario mencionó en otra sesión que "ya pagó ElevenLabs"
  pero no está confirmado en esta sesión.
- El usuario también preguntó por "TTS de Google" (Google Cloud TTS) — call
  aún no investigado a fondo en esta sesión, pendiente de responder.

## Regla de oro (exigida por el usuario, no negociable)
- Nunca gastar dinero sin confirmación explícita previa.
- Nunca declarar éxito sin verificar (correr /test, /test-clip, o pedir que el
  usuario confirme el resultado real).
- Cero repeticiones de imagen en un mismo video, sin excepción.
- Cada video: máximo 60 segundos, sin excepción (ya garantizado
  estructuralmente: guion limitado a 25-40s + 4s de cola = ~44s máx).
- Costo por reel: apuntar a ~$2, no subir sin pedir permiso.
