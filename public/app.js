(() => {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    document.getElementById('subtitle').textContent = 'Speech recognition not supported. Please use Chrome.';
    document.getElementById('listenBtn').disabled = true;
    return;
  }

  const RECOG_LANG = 'cs-CZ,en-US';
  const SETTINGS_KEY = 'live-translator-settings';
  let recognition = null;
  let isListening = false;
  let finalBuffer = '';
  let debounceTimer = null;
  let silenceTimer = null;
  let currentAudio = null;
  let lastOriginal = '';
  let lastTranslated = '';

  const subtitleEl = document.getElementById('subtitle');
  const playBtn = document.getElementById('playBtn');
  const statusEl = document.getElementById('status');
  const historyEl = document.getElementById('history');
  const listenBtn = document.getElementById('listenBtn');
  const settingsBtn = document.getElementById('settingsBtn');
  const settingsPanel = document.getElementById('settingsPanel');
  const settingsOverlay = document.getElementById('settingsOverlay');
  const settingsClose = document.getElementById('settingsClose');
  const silenceTimeoutSelect = document.getElementById('silenceTimeout');

  const API_BASE = (window.location.protocol === 'http:' || window.location.protocol === 'https:')
    ? window.location.origin
    : 'http://localhost:3000';

  function loadSettings() {
    try {
      const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
      if (s.silenceTimeout != null) silenceTimeoutSelect.value = String(s.silenceTimeout);
      if (s.voice) document.querySelector(`input[name="voice"][value="${s.voice}"]`)?.click();
      if (s.speakBoth != null) document.getElementById('speakBoth').checked = s.speakBoth;
    } catch (_) {}
  }

  function saveSettings() {
    const s = {
      silenceTimeout: parseInt(silenceTimeoutSelect.value, 10) || 3,
      voice: document.querySelector('input[name="voice"]:checked')?.value || 'female',
      speakBoth: document.getElementById('speakBoth').checked
    };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  }

  function getSilenceTimeoutSec() {
    return parseInt(silenceTimeoutSelect.value, 10) || 3;
  }

  function resetSilenceTimer() {
    clearTimeout(silenceTimer);
    silenceTimer = null;
    const sec = getSilenceTimeoutSec();
    if (sec > 0 && isListening) {
      silenceTimer = setTimeout(() => {
        if (isListening) {
          stopListening();
          statusEl.textContent = 'Stopped (silence)';
        }
      }, sec * 1000);
    }
  }

  function clearSilenceTimer() {
    clearTimeout(silenceTimer);
    silenceTimer = null;
  }

  function openSettings() {
    settingsPanel.classList.add('open');
    settingsOverlay.classList.add('open');
    loadSettings();
  }

  function closeSettings() {
    settingsPanel.classList.remove('open');
    settingsOverlay.classList.remove('open');
    saveSettings();
  }

  settingsBtn.addEventListener('click', openSettings);
  settingsClose.addEventListener('click', closeSettings);
  settingsOverlay.addEventListener('click', closeSettings);
  silenceTimeoutSelect.addEventListener('change', saveSettings);
  document.getElementById('speakBoth').addEventListener('change', saveSettings);
  document.querySelectorAll('input[name="voice"]').forEach(el => {
    el.addEventListener('change', saveSettings);
  });

  loadSettings();

  function translateAuto(text) {
    return fetch(`${API_BASE}/api/translate-auto`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    })
      .then(r => {
        if (!r.ok) {
          return r.json().then(d => { throw new Error(d.error || d.message || 'Server error'); }).catch(() => { throw new Error('Server error ' + r.status); });
        }
        return r.json();
      });
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

  async function speak(originalText, translatedText) {
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

  function addToHistory(orig, trans, srcLang) {
    const srcLabel = srcLang === 'cs' ? 'Čeština' : 'English';
    const tgtLabel = srcLang === 'cs' ? 'English' : 'Čeština';
    const item = document.createElement('div');
    item.className = 'history-item';
    item.innerHTML = `<div class="orig"><strong>${escapeHtml(srcLabel)}:</strong> ${escapeHtml(orig)}</div><div class="trans"><strong>${escapeHtml(tgtLabel)}:</strong> ${escapeHtml(trans)}</div>`;
    historyEl.insertBefore(item, historyEl.firstChild);
    while (historyEl.children.length > 20) historyEl.removeChild(historyEl.lastChild);
  }

  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function updatePlayButton() {
    playBtn.disabled = !lastOriginal && !lastTranslated;
  }

  async function processFinal(text) {
    const t = text.trim();
    if (!t) return;
    statusEl.textContent = 'Translating...';
    try {
      const { translated, sourceLang } = await translateAuto(t);
      lastOriginal = t;
      lastTranslated = translated;
      updatePlayButton();
      subtitleEl.textContent = translated;
      subtitleEl.classList.remove('listening');
      speak(t, translated).catch(() => {});
      addToHistory(t, translated, sourceLang);
    } catch (e) {
      const msg = e.message || 'Translation failed';
      subtitleEl.textContent = msg === 'Failed to fetch' || msg === 'network' || msg.includes('NetworkError')
        ? 'Network error — is the server running?'
        : 'Error: ' + msg;
      subtitleEl.classList.remove('listening');
    }
    statusEl.textContent = 'Listening...';
  }

  function onResult(event) {
    resetSilenceTimer();
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
    clearSilenceTimer();
    if (!recognition) {
      recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = RECOG_LANG;
      recognition.onresult = onResult;
      recognition.onerror = (e) => {
        if (e.error !== 'no-speech') statusEl.textContent = 'Error: ' + e.error;
      };
      recognition.onend = () => {
        if (isListening) recognition.start();
      };
    }
    recognition.start();
    isListening = true;
    listenBtn.classList.add('listening');
    listenBtn.querySelector('.ctrl-label').textContent = 'Stop';
    statusEl.textContent = 'Listening...';
    resetSilenceTimer();
  }

  function stopListening() {
    isListening = false;
    clearSilenceTimer();
    if (recognition) recognition.stop();
    listenBtn.classList.remove('listening');
    listenBtn.querySelector('.ctrl-label').textContent = 'Start Listening';
    statusEl.textContent = 'Stopped';
  }

  listenBtn.addEventListener('click', () => {
    isListening ? stopListening() : startListening();
  });

  playBtn.addEventListener('click', () => {
    if (!lastOriginal && !lastTranslated) return;
    playBtn.disabled = true;
    speak(lastOriginal, lastTranslated)
      .catch(() => {})
      .finally(() => { updatePlayButton(); });
  });

  updatePlayButton();

  subtitleEl.textContent = 'Speak in Czech or English...';
  fetch(`${API_BASE}/`).catch(() => { statusEl.textContent = 'Server unreachable'; });
})();
