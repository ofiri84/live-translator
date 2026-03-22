const OpenAI = require('openai');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { text, sourceLang, targetLang } = req.body || {};

    if (!text || !sourceLang || !targetLang) {
      return res.status(400).json({ error: 'Missing text, sourceLang, or targetLang' });
    }

    const langNames = { cs: 'Czech', en: 'English' };
    const source = langNames[sourceLang] || sourceLang;
    const target = langNames[targetLang] || targetLang;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are an expert translator between Czech and English. Translate naturally and idiomatically.
Rules: Reply with ONLY the translated text, nothing else. No explanations, no quotes, no preamble.
Preserve the tone (formal/informal) and intent. Use natural phrasing for the target language.`
        },
        {
          role: 'user',
          content: `Translate from ${source} to ${target}:\n\n${text}`
        }
      ],
      max_tokens: 150,
      temperature: 0.3
    });

    const translated = completion.choices[0]?.message?.content?.trim() || '';
    res.json({ translated });
  } catch (err) {
    console.error('Translation error:', err.message);
    res.status(500).json({
      error: err.message || 'Translation failed',
      hint: err.status === 401 ? 'Check your OPENAI_API_KEY' : undefined
    });
  }
}
