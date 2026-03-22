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
    const { text } = req.body || {};
    if (!text) return res.status(400).json({ error: 'Missing text' });

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You translate between Czech and English. The user will give you text in EITHER Czech OR English.
Your task: detect which language it is, then translate to the OTHER language.
Reply in exactly this JSON format, nothing else: {"sourceLang":"cs" or "en", "translated":"the translation"}
Rules: Natural, idiomatic translation. JSON only.`
        },
        { role: 'user', content: String(text) }
      ],
      max_tokens: 200,
      temperature: 0.2
    });

    const raw = completion.choices[0]?.message?.content?.trim() || '';
    let parsed;
    try {
      parsed = JSON.parse(raw.replace(/```json?\s*|\s*```/g, ''));
    } catch {
      parsed = { sourceLang: 'en', translated: raw };
    }
    const { sourceLang = 'en', translated } = parsed;
    res.json({ translated, sourceLang });
  } catch (err) {
    console.error('Translate-auto error:', err.message);
    res.status(500).json({ error: err.message || 'Translation failed' });
  }
};
