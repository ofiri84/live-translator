const OpenAI = require('openai');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const TTS_VOICES = { female: 'nova', male: 'onyx' };

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { text, voice } = req.body || {};
    if (!text || !voice) {
      return res.status(400).json({ error: 'Missing text or voice' });
    }
    const openaiVoice = TTS_VOICES[voice] || TTS_VOICES.female;
    const mp3 = await openai.audio.speech.create({
      model: 'tts-1-hd',
      voice: openaiVoice,
      input: String(text).slice(0, 4096)
    });
    res.setHeader('Content-Type', 'audio/mpeg');
    const buffer = Buffer.from(await mp3.arrayBuffer());
    res.send(buffer);
  } catch (err) {
    console.error('TTS error:', err.message);
    res.status(500).json({ error: err.message || 'Speech failed' });
  }
};
