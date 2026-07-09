# Estado actual (leer esto primero, no el historial de chat)

Repo: github.com/TimothyArcher90/reel-generator (rama main)
URL viva: https://reel-generator-production-5a8d.up.railway.app

## CAMBIOS 2026-07-09 (sesión 2) — voz sin riesgo de perder plata + video más barato y mejor

### Voz — 3 motores de pago ahora, en vez de solo ElevenLabs

**Chatterbox Multilingual (Resemble AI, open-source) vía fal.ai — NUEVO, recomendado.**
`pipeline/chatterboxVoice.js`. Usa el archivo `pipeline/assets/guillermo_ref.wav`
que YA está en el repo como referencia de clonación — no hace falta grabar ni
subir nada nuevo. Se paga por caracter: $0.025 por 1000 caracteres. Un reel de
~45s de narración ≈ 650 caracteres ≈ **$0.016 por reel** (prácticamente
gratis). NO es suscripción — no hay forma de "quedarse sin saldo mensual" como
pasó con ElevenLabs. En pruebas ciegas independientes (Resemble AI / Hugging
Face, verificado julio 2026) Chatterbox le ganó a ElevenLabs 65.3% de las
veces — no es una alternativa inferior, es otro modelo competitivo. Activar:

```
FAL_KEY=...            (la misma que ya usas para video, si la tienes)
VOICE_ENGINE=chatterbox
```

**ElevenLabs** sigue disponible (`ELEVENLABS_API_KEY`+`ELEVENLABS_VOICE_ID=y69I2R3lXBl3VNuimqcD`,
usar solo si `VOICE_ENGINE` no es `chatterbox`) — el bug real de por qué
"no funcionaba" era que el código tenía `useElevenLabs` quemado en `false`
desde el 07-06 (ver más abajo), no necesariamente el servicio en sí. Pero
dado que ya hubo un mal trago de plata ahí, **Chatterbox es la recomendación
para probar primero** — cuesta centavos, no meses de suscripción.

Ambos motores caen automáticamente a XTTS-v2 gratis (y de ahí a Edge-TTS) si
fallan — nunca tumban un reel.

### Video — Seedance 1.5 Pro (ByteDance) reemplaza a Wan como motor por defecto

`pipeline/falVideo.js` (nueva función `animateProductUrlSeedance`). Misma
FAL_KEY que ya usabas para Wan/FLUX, cero cuenta nueva. Más barato y más
nuevo que Wan 2.1:

| Motor | Costo real de un clip de 4s (verificado julio 2026) |
|---|---|
| **Seedance 1.5 Pro** (nuevo default) | ~$0.10-0.15 (sin audio nativo — se descarta a propósito, ver abajo) |
| fal.ai Wan 480p (el de antes) | ~$0.24-0.28 |
| Kling 2.5 Turbo Pro | ~$0.28 |
| Google Veo 3.1 Lite | ~$0.20 (paga audio nativo que igual se descarta) |
| Google Veo 3.1 Fast | ~$0.40 |

**Corrección importante a lo que dije la sesión pasada:** presenté a Veo como
"el más barato" sin comparar contra Kling/Seedance — no era cierto. Seedance
es más barato Y no requiere crear cuenta nueva en Google Cloud. Veo sigue
disponible como opción de comparación de calidad visual (`pipeline/veoVideo.js`,
activar con `GEMINI_API_KEY`+`USE_VEO=true`), pero ya NO es el motor
prioritario — el orden ahora es Seedance → Veo (si se activa) → Wan (respaldo
final). Los tres comparten el mismo tope de gasto `MAX_PAID_CLIPS`.

`generate_audio` se pone en `false` tanto en Seedance como (indirectamente,
descartando la pista) en Veo: `renderVideo.js` ya mezcla la narración de
Guillermo como única pista de audio del video final — pagar audio ambiental
que se descarta en el mux sería tirar plata.

**Nada de esto cambia el comportamiento actual hasta que pongas `FAL_KEY` en
Railway** (si no la tienes ya) — sin key, sigue exactamente igual que hoy
(LTX gratis → Pexels stock).

## ACCIÓN PENDIENTE DEL USUARIO (esto no lo puedo hacer yo, es tu cuenta/tarjeta)
1. **Voz — probar Chatterbox primero (barato, sin riesgo):** conseguir/confirmar
   `FAL_KEY` en fal.ai/dashboard/keys, ponerla en Railway junto con
   `VOICE_ENGINE=chatterbox`.
2. Si prefieres seguir con ElevenLabs: verificar saldo real en elevenlabs.io
   (el incidente de julio 6 fue justo saldo agotado) y poner
   `ELEVENLABS_API_KEY`+`ELEVENLABS_VOICE_ID=y69I2R3lXBl3VNuimqcD` en Railway,
   sin `VOICE_ENGINE=chatterbox`.
3. **Video:** si ya tienes `FAL_KEY` puesta (para lo de arriba), Seedance ya
   queda activo automáticamente como default — no hay nada más que hacer.
4. (Opcional, para comparar calidad) Veo: `GEMINI_API_KEY` de aistudio.google.com
   + `USE_VEO=true` en Railway.
5. Avisar cuando estén las variables puestas para correr un reel de prueba
   real y confirmar juntos que la voz y el video salen bien.

## Costo esperado por reel con Chatterbox + Seedance, MAX_PAID_CLIPS=7
- Voz: ~$0.02 (Chatterbox)
- Video: 7 × ~$0.13 (frame FLUX ~$0.005 + Seedance ~$0.12) ≈ $0.91
- **Total: ~$0.93/reel** — bastante por debajo del techo de ~$2/reel, y con
  mejor calidad esperada que el stack anterior (Wan 480p + Edge-TTS genérico).

## Bugs reales encontrados y arreglados (histórico, ver commits en orden)
1. `5f70317` — manos/rostros deformados: reglas para evitar close-ups de
   anatomía humana en generateScript.js/qaScript.js/qaImage.js.
2. `d05bfe5` — bug raíz de imagen repetida: catch sin envolver en el fallback
   de Pexels podía morir silenciosamente a mitad del bucle.
3. `3afee93` — cero repeticiones de imagen, segDur flexible 2.5-4.5s.
4. `9241cc3` — Pexels stock real prioritario sobre Pollinations (imagen IA
   gratis, estructuralmente de baja calidad).
5. `cbb1e11` → `1657be7` — MAX_PAID_CLIPS 15 → 7 (~$2/reel).
6. **(sesión 2026-07-09)** `useElevenLabs` estaba quemado en `false` desde el
   incidente de saldo del 07-06 — aunque se arreglara la cuenta, el código
   seguía ignorándola sin otro deploy manual. Ahora se auto-detecta por env
   vars, con fallback seguro si falla.

## Regla de oro (exigida por el usuario, no negociable)
- Nunca gastar dinero sin confirmación explícita previa.
- Nunca declarar éxito sin verificar (correr /test, /test-clip, o pedir que el
  usuario confirme el resultado real).
- Cero repeticiones de imagen en un mismo video, sin excepción.
- Cada video: máximo 60 segundos, sin excepción.
- Costo por reel: apuntar a ~$2, no subir sin pedir permiso (con el stack
  nuevo el gasto real esperado es bastante menor, ~$0.93).
