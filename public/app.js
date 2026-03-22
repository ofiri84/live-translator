(() => {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    document.getElementById('subtitle').textContent = 'Speech recognition not supported. Please use Chrome.';
    document.getElementById('listenBtn').disabled = true;
    return;
  }

  const modes = {
    listen: { source: 'cs', target: 'en', recogLang: 'cs-CZ', sourceLabel: 'Čeština', targetLabel: 'English' },
    talk: { source: 'en', target: 'cs', recogLang: 'en-US', sourceLabel: 'English', targetLabel: 'Čeština' }
  };

  let currentMode = 'listen';
  let recognition = null;
  let isListening = false;
  let finalBuffer = '';
  let debounceTimer = null;
  let currentAudio = null;
  let lastOriginal = '';
  let lastTranslated = '';

  const subtitleEl = document.getElementById('subtitle');
  const playBtn = document.getElementById('playBtn');
  const statusEl = document.getElementById('status');
  const historyEl = document.getElementById('history');
  const listenBtn = document.getElementById('listenBtn');
  const modeBtns = document.querySelectorAll('.mode-btn');
  const sourceLabels = document.querySelectorAll('.source-label');
  const targetLabels = document.querySelectorAll('.target-label');

  function setMode(mode) {
    currentMode = mode;
    const cfg = modes[mode];
    modeBtns.forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
    sourceLabels.forEach(el => { el.textContent = cfg.sourceLabel; });
    targetLabels.forEach(el => { el.textContent = cfg.targetLabel; });
    if (recognition) recognition.lang = cfg.recogLang;
    subtitleEl.textContent = 'Listening...';
    subtitleEl.classList.add('listening');
    statusEl.textContent = `Mode: ${mode === 'listen' ? 'Czech → English' : 'English → Czech'}`;
  }

  const API_BASE = (window.location.protocol === 'http:' || window.location.protocol === 'https:')
    ? window.location.origin
    : 'http://localhost:3000';

  function translate(text, sourceLang, targetLang) {
    return fetch(`${API_BASE}/api/translate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, sourceLang, targetLang })
    })
      .then(r => {
        if (!r.ok) {
          return r.json().then(d => { throw new Error(d.error || d.message || 'Server error'); }).catch(() => { throw new Error('Server error ' + r.status); });
        }
        return r.json();
      })
      .then(d => d.translated || '');
  }

  function getVoiceGender() {
    return document.querySelector('input[name="voice"]:checked')?.value || 'female';
  }

  function speakOne(text) {
    return new Promise(async (resolve, reject) => {
      if (currentAudio) {
        currentAudio.pause();
        currentAudio = null;
      }
      const voice = getVoiceGender();
      try {
        const res = await fetch(`${API_BASE}/api/speak`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, voice })
        });
        if (!res.ok) throw new Error('Speech failed');
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        currentAudio = audio;
        audio.onended = () => {
          URL.revokeObjectURL(url);
          currentAudio = null;
          resolve();
        };
        audio.onerror = () => {
          URL.revokeObjectURL(url);
          currentAudio = null;
          reject();
        };
        audio.play();
      } catch (e) {
        reject(e);
      }
    });
  }

  async function speak(originalText, translatedText, sourceLang, targetLang) {
    const speakBoth = document.getElementById('speakBoth')?.checked;
    if (currentAudio) {
      currentAudio.pause();
      currentAudio = null;
    }
    if (speakBoth && originalText) {
      await speakOne(originalText).catch(() => {});
    }
    if (translatedText) {
      await speakOne(translatedText).catch(() => {});
    }
  }

  function addToHistory(orig, trans) {
    const item = document.createElement('div');
    item.className = 'history-item';
    item.innerHTML = `<div class="orig">${escapeHtml(orig)}</div><div class="trans">${escapeHtml(trans)}</div>`;
    historyEl.insertBefore(item, historyEl.firstChild);
    while (historyEl.children.length > 20) historyEl.removeChild(historyEl.lastChild);
  }

  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  async function processFinal(text) {
    const t = text.trim();
    if (!t) return;
    const cfg = modes[currentMode];
    statusEl.textContent = 'Translating...';
    try {
      const translated = await translate(t, cfg.source, cfg.target);
      lastOriginal = t;
      lastTranslated = translated;
      updatePlayButton();
      subtitleEl.textContent = translated;
      subtitleEl.classList.remove('listening');
      speak(t, translated, cfg.source, cfg.target).catch(() => {});
      addToHistory(t, translated);
    } catch (e) {
      const msg = e.message || 'Translation failed';
      subtitleEl.textContent = msg === 'Failed to fetch' || msg === 'network' || msg.includes('NetworkError')
        ? 'Network error — is the server running? Open http://localhost:3000'
        : 'Error: ' + msg;
      subtitleEl.classList.remove('listening');
    }
    statusEl.textContent = 'Listening...';
  }

  function onResult(event) {
    let interim = '';
    let final = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const r = event.results[i];
      const t = r[0].transcript;
      if (r.isFinal) {
        final += t;
      } else {
        interim += t;
      }
    }
    if (final) {
      finalBuffer += final;
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        processFinal(finalBuffer);
        finalBuffer = '';
      }, 400);
    }
    if (interim && !final) {
      subtitleEl.textContent = interim;
      subtitleEl.classList.add('listening');
    }
  }

  function startListening() {
    if (!recognition) {
      recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = modes[currentMode].recogLang;
      recognition.onresult = onResult;
      recognition.onerror = (e) => {
        if (e.error !== 'no-speech') statusEl.textContent = 'Error: ' + e.error;
      };
      recognition.onend = () => {
        if (isListening) recognition.start();
      };
    } else {
      recognition.lang = modes[currentMode].recogLang;
    }
    recognition.start();
    isListening = true;
    listenBtn.classList.add('listening');
    listenBtn.querySelector('.ctrl-label').textContent = 'Stop';
    statusEl.textContent = 'Listening...';
  }

  function stopListening() {
    isListening = false;
    if (recognition) recognition.stop();
    listenBtn.classList.remove('listening');
    listenBtn.querySelector('.ctrl-label').textContent = 'Start Listening';
    statusEl.textContent = 'Stopped';
  }

  listenBtn.addEventListener('click', () => {
    isListening ? stopListening() : startListening();
  });

  function updatePlayButton() {
    playBtn.disabled = !lastOriginal && !lastTranslated;
  }

  playBtn.addEventListener('click', () => {
    if (!lastOriginal && !lastTranslated) return;
    playBtn.disabled = true;
    speak(lastOriginal, lastTranslated, modes[currentMode].source, modes[currentMode].target)
      .catch(() => {})
      .finally(() => { updatePlayButton(); });
  });

  updatePlayButton();

  modeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.mode === currentMode) return;
      setMode(btn.dataset.mode);
      if (isListening) {
        stopListening();
        startListening();
      }
    });
  });

  setMode('listen');

  fetch(`${API_BASE}/`).catch(() => { statusEl.textContent = 'Server unreachable — run: npm start in live-translator folder'; });
})();
