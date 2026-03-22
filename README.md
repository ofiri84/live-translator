# Live Translator · Czech ↔ English

Real-time speech translation between Czech and English using AI. Two modes:

- **Listen**: Hear Czech → get English subtitle + spoken English
- **Talk**: Speak English → get Czech subtitle + spoken Czech

## Setup

```bash
cd live-translator
npm install
```

Add `OPENAI_API_KEY` to a `.env` file (or use one in the parent directory):

```
OPENAI_API_KEY=sk-...
```

## Run

**Desktop** (Chrome):
```bash
npm start
```
Open http://localhost:3000

**Mobile** (phone on same Wi‑Fi):
```bash
npm run mobile
```
Use the `https://` URL shown in the terminal (e.g. `https://192.168.1.5:3000`).

- Phone and computer must be on the **same Wi‑Fi**
- First visit: accept the self‑signed certificate warning (“Advanced” → “Proceed”)
- Use **Chrome** on Android or **Safari** on iPhone

## Usage

1. Choose **Listen** (Czech → English) or **Talk** (English → Czech)
2. Tap **Start Listening**
3. Speak or play audio in the source language
4. See live subtitles and hear the translation

**Tip**: On mobile, add to Home Screen for an app‑like experience.

---

## Deploy as a public website

Host the app online so you (and others) can use it from any device at your own URL.

### Option A: Vercel (recommended)

1. Push the project to GitHub
2. Go to [vercel.com](https://vercel.com) → **Add New** → **Project**
3. Import the repo and deploy
4. In **Settings → Environment Variables**, add `OPENAI_API_KEY`
5. Redeploy

You’ll get a URL like `https://live-translator-xxx.vercel.app`.

### Option B: Render

1. Push the project to GitHub
2. Go to [render.com](https://render.com) → **New** → **Web Service**
3. Connect the repo
4. Add env var: `OPENAI_API_KEY` = your key
5. Deploy (free tier available)

You’ll get a URL like `https://live-translator-xxx.onrender.com`.

---

Translation is powered by OpenAI GPT-4o-mini for natural, idiomatic results.
