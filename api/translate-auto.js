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
    const { text, voice = 'female', speakBoth = false } = req.body || {};
    if (!text) return res.status(400).json({ error: 'Missing text' });

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You translate between Czech and English. CRITICAL: First DETECT the language of the input, then translate to the OTHER language.

Language detection rules:
- Czech: uses ř, ě, š, č, ž, ý, á, í, ú, ů, ň, typical words (dobrý, děkuji, prosím, jak, co, kde, proč)
- English: no diacritics, typical words (hello, thank you, please, how, what, where, why)
- If unclear (e.g. "hello" vs "helo"), use word patterns and grammar to decide
- NEVER assume Czech by default - analyze each input fresh

Reply ONLY with valid JSON, nothing else: {"sourceLang":"cs" or "en", "translated":"the translation"}
Examples: "Hello" → {"sourceLang":"en","translated":"Ahoj"}; "Ahoj" → {"sourceLang":"cs","translated":"Hello"}`
        },
        { role: 'user', content: String(text) }
      ],
      max_tokens: 200,
      temperature: 0.1
    });

    const raw = completion.choices[0]?.message?.content?.trim() || '';
    let parsed;
    try {
      parsed = JSON.parse(raw.replace(/```json?\s*|\s*```/g, ''));
    } catch {
      parsed = { sourceLang: 'en', translated: raw };
    }
    const { sourceLang = 'en', translated } = parsed;
    const openaiVoice = TTS_VOICES[voice] || TTS_VOICES.female;

    const ttsTasks = [
      openai.audio.speech.create({ model: 'tts-1', voice: openaiVoice, input: translated.slice(0, 4096) })
    ];
    if (speakBoth && text) {
      ttsTasks.push(openai.audio.speech.create({ model: 'tts-1', voice: openaiVoice, input: String(text).slice(0, 4096) }));
    }
    const ttsResults = await Promise.all(ttsTasks);
    const audioTranslated = ttsResults[0];
    const audioOriginal = ttsResults[1] || null;

    const [bufTrans, bufOrig] = await Promise.all([
      audioTranslated.arrayBuffer(),
      audioOriginal ? audioOriginal.arrayBuffer() : Promise.resolve(null)
    ]);

    res.json({
      translated,
      sourceLang,
      audioTranslated: Buffer.from(bufTrans).toString('base64'),
      audioOriginal: bufOrig ? Buffer.from(bufOrig).toString('base64') : null
    });
  } catch (err) {
    console.error('Translate-auto error:', err.message);
    res.status(500).json({ error: err.message || 'Translation failed' });
  }
};
