# Estado actual (leer esto primero, no el historial de chat)

Repo: github.com/TimothyArcher90/reel-generator (rama main)
URL viva: https://reel-generator-production-5a8d.up.railway.app
Última verificación de salud: HTTP 200 en GET /test tras commit 1657be7.

## CAMBIOS 2026-07-09 (esta sesión) — resolver "voz robótica" + "video horrible"

**Voz — ya no depende de un booleano hardcodeado.** `useElevenLabs` en
server.js ahora se auto-detecta por la presencia de `ELEVENLABS_API_KEY` +
`ELEVENLABS_VOICE_ID` en el entorno, en vez de estar forzado a `false` en el
código (así estaba desde el 2026-07-06 por saldo agotado — el bug real no era
de código, era que aunque se arreglara el saldo, alguien tenía que entrar a
cambiar una línea y redeployar). Además se agregó
`generateVoiceoverElevenLabsWithFallback` — si ElevenLabs falla (401, saldo,
lo que sea) cae solo a XTTS-v2 gratis y de ahí a Edge-TTS, igual que las otras
vías, así que activarlo es sin riesgo de tumbar un reel.

**ACCIÓN PENDIENTE DEL USUARIO (no soy yo quien puede hacerlo):**
1. Verificar en elevenlabs.io que la cuenta tiene saldo/plan activo (el
   incidente de julio 6 fue justo esto: 401/quota_exceeded).
2. En Railway → Variables del servicio, poner:
   `ELEVENLABS_API_KEY=<tu key real>`
   `ELEVENLABS_VOICE_ID=y69I2R3lXBl3VNuimqcD` (Guillermo, ya clonado)
3. Nada más — el próximo reel generado ya usa la voz real, sin tocar código.

**Video — se agregó Google Veo 3.1 como motor de pago PRIORITARIO**, nuevo
módulo `pipeline/veoVideo.js`. Reemplaza a fal.ai Wan como primera opción de
pago (fal.ai queda como respaldo automático si Veo falla o no está
configurado — cero cambio de comportamiento si no se activa). Por qué: Veo
3.1 Lite 720p cuesta $0.05/seg → un clip de 4s sale a **$0.20**, más barato
que el combo actual FLUX-pro+Wan (~$0.24-0.28/clip), con mejor calidad de
movimiento (modelo mucho más nuevo que Wan 2.1) y audio nativo incluido.
Contrato de API verificado contra ai.google.dev/gemini-api/docs/veo (no
adivinado): `POST .../models/{model}:predictLongRunning`, polling por
`operations/{id}`, descarga con header `x-goog-api-key`.

**ACCIÓN PENDIENTE DEL USUARIO:**
1. Sacar una API key de Gemini en aistudio.google.com (la misma cuenta que ya
   tienes conectada a Composio para VEO — pero esto llama la API REST
   directo, no depende de Composio en producción).
2. En Railway → Variables:
   `GEMINI_API_KEY=<tu key>`
   `USE_VEO=true`
   (opcional) `VEO_MODEL=veo-3.1-lite-generate-preview` (default, el más
   barato) — subir a `veo-3.1-fast-generate-preview` si Lite no convence en
   calidad, cuesta el doble ($0.40/clip de 4s).
3. Sin estas dos variables, el pipeline sigue exactamente igual que antes
   (fal.ai Wan si hay FAL_KEY, si no LTX/Pexels).

**Costo esperado con Veo activo, MAX_PAID_CLIPS=7 (sin cambiar el tope
actual):** 7 × $0.20 ≈ **$1.40/reel de video** (antes ~$1.96 con fal.ai) — MÁS
barato Y mejor calidad, dentro del techo de ~$2/reel que ya pediste.

**Nota importante sobre Veo — verificar en la primera prueba real:** Veo solo
acepta duraciones de 4, 6 u 8 segundos exactos (verificado en la doc oficial).
El código ya pide 4s (el máximo que permite el estándar de calidad del
proyecto), así que no debería haber sorpresas de costo, pero confirmar con un
`/test-clip` real antes de dar por bueno el número.

## Costo actual por reel (confirmado con el usuario, no cambiar sin su OK)
- MAX_PAID_CLIPS = 7 (server.js) — los primeros 7 clips (hook + escenas iniciales)
  usan pago: Veo 3.1 si está activo (~$0.20/clip), si no fal.ai Wan (~$0.24-0.28/clip).
- Costo objetivo del usuario: "al menos $2 por video".
  NO subir MAX_PAID_CLIPS sin confirmación explícita.
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
4. `9241cc3` — Pollinations (imagen IA gratis) es estructuralmente de baja
   calidad. Fix: los clips sin presupuesto de pago ahora intentan Pexels stock
   real PRIMERO, Pollinations solo como respaldo secundario.
5. `cbb1e11` → `1657be7` — ajuste de costo: MAX_PAID_CLIPS 15 → 7 (~$2/reel).

## Regla de oro (exigida por el usuario, no negociable)
- Nunca gastar dinero sin confirmación explícita previa.
- Nunca declarar éxito sin verificar (correr /test, /test-clip, o pedir que el
  usuario confirme el resultado real).
- Cero repeticiones de imagen en un mismo video, sin excepción.
- Cada video: máximo 60 segundos, sin excepción.
- Costo por reel: apuntar a ~$2, no subir sin pedir permiso.
