const axios = require("axios");

async function generateVoiceover(text) {
  const apiKey  = process.env.MINIMAX_API_KEY;
  const voiceId = process.env.MINIMAX_VOICE_ID;
  const groupId = process.env.MINIMAX_GROUP_ID;

  const url = `https://api.minimax.io/v1/t2a_v2${groupId ? `?GroupId=${groupId}` : ""}`;

  const { data } = await axios.post(url, {
    model: "speech-02-hd",
    text,
    voice_setting: {
      voice_id:  voiceId,
      speed:     1.0,
      vol:       1.0,
      pitch:     0
    },
    audio_setting: {
      sample_rate: 32000,
      bitrate:     128000,
      format:      "mp3"
    }
  }, {
    headers: {
      Authorization:  `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    timeout: 120000
  });

  if (data.base_resp && data.base_resp.status_code !== 0) {
    throw new Error("MiniMax error: " + data.base_resp.status_msg);
  }

  const audioUrl = data.audio_file || data.data?.audio_file;
  if (!audioUrl) throw new Error("MiniMax: no audio_file en respuesta: " + JSON.stringify(data).slice(0, 300));
  return audioUrl;
}

module.exports = { generateVoiceover };
