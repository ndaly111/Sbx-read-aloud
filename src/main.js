import WebSpeechEngine from './engines/webSpeechEngine.js';
import PiperEngine from './engines/piperEngine.js';
import './style.css';

const elements = {
  textInput: document.getElementById('text-input'),
  sampleBtn: document.getElementById('sample-btn'),
  modeSelect: document.getElementById('mode-select'),
  voiceRow: document.getElementById('voice-row'),
  voiceSelect: document.getElementById('voice-select'),
  rateSlider: document.getElementById('rate-slider'),
  rateValue: document.getElementById('rate-value'),
  playBtn: document.getElementById('play-btn'),
  pauseBtn: document.getElementById('pause-btn'),
  resumeBtn: document.getElementById('resume-btn'),
  stopBtn: document.getElementById('stop-btn'),
  statusText: document.getElementById('status-text'),
  progress: document.getElementById('progress'),
  progressBar: document.getElementById('progress-bar'),
  modal: document.getElementById('modal'),
  modalMessage: document.getElementById('modal-message'),
  modalOk: document.getElementById('modal-ok'),
  debugListBtn: document.getElementById('list-voices-btn'),
  debugClearBtn: document.getElementById('clear-cache-btn'),
  balancedVoiceId: document.getElementById('balanced-voice-id'),
  bestVoiceId: document.getElementById('best-voice-id'),
};

const SAMPLE_TEXT = 'Hello! This is a quick demo of the voice mode sandbox with pause, resume, and stop controls.';

const webSpeech = new WebSpeechEngine();
const piper = new PiperEngine();

let mode = elements.modeSelect.value;
let playToken = 0;
let statusState = 'idle';
let activePiperVoice = null;
let activeMode = null;

function setStatus(text, { showProgress = false, progress = 0 } = {}) {
  elements.statusText.textContent = text;
  if (showProgress) {
    elements.progress.hidden = false;
    elements.progressBar.style.width = `${Math.round(progress)}%`;
  } else {
    elements.progress.hidden = true;
    elements.progressBar.style.width = '0%';
  }
}

function setButtons({ playing = false, paused = false, busy = false } = {}) {
  elements.playBtn.disabled = busy || playing || paused;
  elements.pauseBtn.disabled = !playing;
  elements.resumeBtn.disabled = !paused;
  elements.stopBtn.disabled = !(busy || playing || paused);
  elements.modeSelect.disabled = busy || playing || paused;
}

function showModal(message) {
  elements.modalMessage.textContent = message;
  elements.modal.classList.remove('hidden');
}

function hideModal() {
  elements.modal.classList.add('hidden');
}

elements.modalOk.addEventListener('click', hideModal);

function updateRateValue() {
  elements.rateValue.textContent = `${Number(elements.rateSlider.value).toFixed(2)}x`;
}
updateRateValue();

elements.rateSlider.addEventListener('input', updateRateValue);

elements.sampleBtn.addEventListener('click', () => {
  elements.textInput.value = SAMPLE_TEXT;
});

elements.modeSelect.addEventListener('change', () => {
  mode = elements.modeSelect.value;
  elements.voiceRow.style.display = mode === 'fastest' ? 'flex' : 'none';
});

function selectDefaultVoice(voices) {
  const enVoice = voices.find((v) => v.lang?.startsWith('en'));
  const chosen = enVoice || voices[0];
  if (chosen) {
    elements.voiceSelect.value = chosen.voiceURI;
  }
}

async function loadWebVoices() {
  const voices = await webSpeech.loadVoices();
  elements.voiceSelect.innerHTML = '';
  voices.forEach((voice) => {
    const option = document.createElement('option');
    option.value = voice.voiceURI;
    option.textContent = `${voice.name} (${voice.lang})`;
    elements.voiceSelect.appendChild(option);
  });
  selectDefaultVoice(voices);
}

loadWebVoices();

let webSpeechCallbacksRegistered = false;
function ensureWebSpeechCallbacks() {
  if (webSpeechCallbacksRegistered) return;
  webSpeech.on('end', () => {
    statusState = 'idle';
    setStatus('Ready');
    setButtons();
    activeMode = null;
  });
  webSpeech.on('start', () => {
    statusState = 'playing';
    setStatus('Playing');
    setButtons({ playing: true });
  });
  webSpeech.on('pause', () => {
    statusState = 'paused';
    setStatus('Paused');
    setButtons({ paused: true });
  });
  webSpeech.on('resume', () => {
    statusState = 'playing';
    setStatus('Playing');
    setButtons({ playing: true });
  });
  webSpeechCallbacksRegistered = true;
}

elements.voiceRow.style.display = mode === 'fastest' ? 'flex' : 'none';

elements.playBtn.addEventListener('click', async () => {
  const text = elements.textInput.value.trim();
  if (!text) return;
  playToken += 1;
  const token = playToken;
  activeMode = mode;
  setButtons({ busy: true });

  const rate = Number(elements.rateSlider.value);

  if (mode === 'fastest') {
    ensureWebSpeechCallbacks();
    setStatus('Playing');
    try {
      await webSpeech.play(text, { voiceURI: elements.voiceSelect.value, rate });
      statusState = 'playing';
      setButtons({ playing: true });
    } catch (err) {
      console.error(err);
      statusState = 'idle';
      setStatus('Ready');
      setButtons();
    }
    return;
  }

  const chosenVoiceId = mode === 'balanced' ? elements.balancedVoiceId.value : elements.bestVoiceId.value;
  try {
    setStatus('Preparing…', { showProgress: true, progress: 5 });
    const playResult = await piper.play(text, {
      voiceId: chosenVoiceId,
      fallbackVoiceId: elements.balancedVoiceId.value,
      mode,
      rate,
      onProgress: (info) => {
        if (token !== playToken) return;
        if (info.stage === 'download') {
          setStatus(`Downloading voice pack… ${info.percent}%`, { showProgress: true, progress: info.percent });
        } else if (info.stage === 'predict') {
          setStatus('Synthesizing…');
        }
      },
      token,
    });
    if (playResult?.status === 'playing' && token === playToken) {
      statusState = 'playing';
      setStatus('Playing');
      setButtons({ playing: true });
      activePiperVoice = playResult.voiceUsed;
    }
  } catch (err) {
    console.warn('Piper failed', err);
    if (token !== playToken) return;
    const fallbackMessage = `${mode.charAt(0).toUpperCase() + mode.slice(1)} is not available right now. Switching to Fastest.`;
    showModal(fallbackMessage);
    elements.modeSelect.value = 'fastest';
    elements.voiceRow.style.display = 'flex';
    mode = 'fastest';
    activeMode = 'fastest';
    ensureWebSpeechCallbacks();
    try {
      await webSpeech.play(text, { voiceURI: elements.voiceSelect.value, rate });
      statusState = 'playing';
      setStatus('Playing');
      setButtons({ playing: true });
    } catch (speechErr) {
      console.error('Web speech fallback failed', speechErr);
      statusState = 'idle';
      setStatus('Ready');
      setButtons();
    }
  }
});

elements.pauseBtn.addEventListener('click', () => {
  playToken += 1; // invalidate Piper playback token
  const targetMode = activeMode || mode;
  if (targetMode === 'fastest') {
    webSpeech.pause();
  } else {
    piper.pause();
  }
});

elements.resumeBtn.addEventListener('click', () => {
  playToken += 1; // new token for resumed Piper playback
  const targetMode = activeMode || mode;
  if (targetMode === 'fastest') {
    webSpeech.resume();
  } else {
    piper.resume(Number(elements.rateSlider.value));
  }
});

elements.stopBtn.addEventListener('click', () => {
  playToken += 1;
  statusState = 'idle';
  setStatus('Ready');
  setButtons();
  const targetMode = activeMode || mode;
  activeMode = null;
  if (targetMode === 'fastest') {
    webSpeech.stop();
  } else {
    piper.stop();
  }
});

piper.on('playing', () => {
  statusState = 'playing';
  setStatus('Playing');
  setButtons({ playing: true });
});

piper.on('paused', () => {
  statusState = 'paused';
  setStatus('Paused');
  setButtons({ paused: true });
});

piper.on('ended', () => {
  statusState = 'idle';
  setStatus('Ready');
  setButtons();
  activeMode = null;
});

piper.on('error', (err) => {
  console.error('Piper error', err);
  statusState = 'idle';
  setStatus('Ready');
  setButtons();
  activeMode = null;
});

async function ensureBestVoiceExists() {
  try {
    const voices = await piper.getVoices();
    const bestId = elements.bestVoiceId.value;
    if (!Array.isArray(voices) || !voices.includes(bestId)) {
      elements.bestVoiceId.value = elements.balancedVoiceId.value;
    }
  } catch (err) {
    console.warn('Could not verify Piper voices', err);
  }
}

ensureBestVoiceExists();

elements.debugListBtn.addEventListener('click', async () => {
  try {
    const voices = await piper.getVoices();
    console.log('Piper voices:', voices);
  } catch (err) {
    console.error('Unable to list voices', err);
  }
});

elements.debugClearBtn.addEventListener('click', async () => {
  try {
    await piper.flush();
    setStatus('Cache cleared');
    setTimeout(() => setStatus('Ready'), 1000);
  } catch (err) {
    console.error('Unable to clear cache', err);
  }
});

function initModalClose() {
  elements.modal.addEventListener('click', (evt) => {
    if (evt.target === elements.modal) {
      hideModal();
    }
  });
}

initModalClose();
