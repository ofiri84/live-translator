const path = require('path');
const os = require('os');
require('dotenv').config({ path: path.join(__dirname, '.env') });
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const express = require('express');
const cors = require('cors');
const OpenAI = require('openai');
const app = express();
const PORT = process.env.PORT || 3000;
const useHttps = process.env.USE_HTTPS === '1';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

app.post('/api/translate-auto', async (req, res) => {
  try {
    const { text } = req.body;
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
        { role: 'user', content: text }
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
});

app.post('/api/translate', async (req, res) => {
  try {
    const { text, sourceLang, targetLang } = req.body;

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
      hint: err.status === 401 ? 'Check your OPENAI_API_KEY in .env' : undefined
    });
  }
});

const TTS_VOICES = { female: 'nova', male: 'onyx' };

app.post('/api/speak', async (req, res) => {
  try {
    const { text, voice } = req.body;
    if (!text || !voice) {
      return res.status(400).json({ error: 'Missing text or voice' });
    }
    const openaiVoice = TTS_VOICES[voice] || TTS_VOICES.female;
    const mp3 = await openai.audio.speech.create({
      model: 'tts-1-hd',
      voice: openaiVoice,
      input: text.slice(0, 4096)
    });
    res.setHeader('Content-Type', 'audio/mpeg');
    res.send(Buffer.from(await mp3.arrayBuffer()));
  } catch (err) {
    console.error('TTS error:', err.message);
    res.status(500).json({ error: err.message || 'Speech failed' });
  }
});

function getLocalIp() {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return 'localhost';
}

function logUrls() {
  const protocol = useHttps ? 'https' : 'http';
  const ip = getLocalIp();
  console.log(`\n🌐 Live Translator · Czech ↔ English\n`);
  console.log(`   Desktop:  ${protocol}://localhost:${PORT}`);
  if (ip !== 'localhost') {
    console.log(`   Mobile:   ${protocol}://${ip}:${PORT}`);
    if (!useHttps) {
      console.log(`\n   💡 For mobile: run "npm run mobile" (HTTPS required for speech)\n`);
    }
  } else {
    console.log('');
  }
}

function startServer() {
  const server = app.listen(PORT, '0.0.0.0', () => logUrls());
  return server;
}

if (useHttps) {
  const selfsigned = require('selfsigned');
  const attrs = [{ name: 'commonName', value: 'localhost' }];
  const pem = selfsigned.generate(attrs, { days: 365 });
  const https = require('https');
  const server = https.createServer(
    { key: pem.private, cert: pem.cert },
    app
  );
  server.listen(PORT, '0.0.0.0', () => {
    logUrls();
    console.log('   🔒 HTTPS (self-signed) — accept browser warning on first visit\n');
  });
} else {
  startServer();
}
