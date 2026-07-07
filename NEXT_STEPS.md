# Estado actual (leer esto primero, no el historial de chat)

Repo: github.com/TimothyArcher90/reel-generator (rama main)
URL viva: https://reel-generator-production-5a8d.up.railway.app

## Qué está resuelto
- Video/audio ya no desincroniza (renderVideo.js usa duración real por clip).
- Visuales relevantes al contenido real del PDF (generateScript.js genera videoPrompts+stockQueries por segmento, ya no un tema fijo "tech").
- Motor de video 100% gratis: LTX-Video (HF Space) como intento primario, Pexels stock video como respaldo automático (pipeline/pexels.js).
- Merge de clips reescrito con concat demuxer (rápido, no OOM en Railway).
- Recién agregado: timeout DURO por comando ffmpeg (mata el proceso si cuelga >45-90s según el paso) + logging de progreso fino por sub-paso (pipeline/renderVideo.js `run()` y `onProgress`).

## Qué falta verificar (bloqueante)
1. Confirmar que el commit con el fix de timeout+progress quedó pusheado a main y Railway redeployó.
2. Lanzar un reel de prueba real (usar `scratchpad/spinoza.txt` si existe, o cualquier PDF) vía POST /start.
3. Monitorear con polling a /status/:jobId — con el nuevo onProgress se debería ver EXACTAMENTE en qué sub-paso (clip N, concat, extend, mux) se traba si vuelve a colgarse.
4. Si termina bien: descargar el MP4, sacar frames con ffmpeg y mirarlos para confirmar que el contenido visual corresponde al PDF real (no genérico).
5. Verificar con ffprobe que duración de video = duración de audio.
6. SOLO después de esa verificación real, reportar al usuario que la URL funciona — no antes.

## Regla de oro (exigida por el usuario, no negociable)
Cero gasto adicional. Nunca declarar éxito sin descargar y verificar el output real (frames + duración). El usuario ya perdió dinero antes por bugs no detectados a tiempo.
