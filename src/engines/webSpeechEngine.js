const callbacks = new Map();

function emit(event, payload) {
  const listeners = callbacks.get(event) || [];
  listeners.forEach((fn) => fn(payload));
}

export default class WebSpeechEngine {
  constructor() {
    this.voices = [];
    this.voiceLoadPromise = null;
    this.currentUtterance = null;
    this._bindVoiceChange();
  }

  _bindVoiceChange() {
    window.speechSynthesis?.addEventListener('voiceschanged', () => {
      this.loadVoices(true);
    });
  }

  async loadVoices(force = false) {
    if (this.voiceLoadPromise && !force) return this.voiceLoadPromise;
    this.voiceLoadPromise = new Promise((resolve) => {
      const voices = window.speechSynthesis?.getVoices() || [];
      if (voices.length > 0) {
        this.voices = voices;
        resolve(voices);
      } else {
        // Try again on next tick to handle async loading
        setTimeout(() => {
          const retry = window.speechSynthesis?.getVoices() || [];
          this.voices = retry;
          resolve(retry);
        }, 100);
      }
    });
    return this.voiceLoadPromise;
  }

  on(event, cb) {
    const existing = callbacks.get(event) || [];
    callbacks.set(event, [...existing, cb]);
  }

  play(text, { voiceURI, rate = 1 }) {
    return new Promise((resolve, reject) => {
      if (!window.speechSynthesis) {
        reject(new Error('Speech Synthesis not supported'));
        return;
      }
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = rate;
      if (voiceURI) {
        const voice = this.voices.find((v) => v.voiceURI === voiceURI);
        if (voice) utterance.voice = voice;
      }
      let settled = false;
      const timeoutId = setTimeout(() => {
        if (!settled) {
          settled = true;
          reject(new Error('Speech start timeout'));
        }
      }, 3000);
      const settle = (fn) => {
        return (...args) => {
          fn?.(...args);
          if (!settled) {
            settled = true;
            clearTimeout(timeoutId);
          }
        };
      };
      utterance.onstart = settle(() => {
        emit('start');
        resolve();
      });
      utterance.onend = settle(() => emit('end'));
      utterance.onpause = settle(() => emit('pause'));
      utterance.onresume = settle(() => emit('resume'));
      utterance.onerror = settle((err) => {
        emit('error', err);
        reject(err?.error || err);
      });
      this.currentUtterance = utterance;
      window.speechSynthesis.speak(utterance);
    });
  }

  pause() {
    if (window.speechSynthesis?.speaking) {
      window.speechSynthesis.pause();
      emit('pause');
    }
  }

  resume() {
    if (window.speechSynthesis?.paused) {
      window.speechSynthesis.resume();
      emit('resume');
    }
  }

  stop() {
    window.speechSynthesis?.cancel();
    emit('end');
  }
}
