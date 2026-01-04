import WorkerUrl from '../workers/piper.worker.js?worker&url';

const listeners = new Map();

function emit(event, payload) {
  const existing = listeners.get(event) || [];
  existing.forEach((cb) => cb(payload));
}

export default class PiperEngine {
  constructor() {
    this.worker = null;
    this.requestId = 0;
    this.pending = new Map();
    this.audio = null;
    this.currentUrl = null;
    this.currentRate = 1;
    this.playToken = 0;
    this.currentVoiceId = null;
    this.suppressNextPauseEvent = false;
  }

  on(event, cb) {
    const existing = listeners.get(event) || [];
    listeners.set(event, [...existing, cb]);
  }

  _ensureWorker() {
    if (this.worker) return;
    this.worker = new Worker(WorkerUrl, { type: 'module' });
    this.worker.onmessage = (event) => {
      const { requestId, type, data } = event.data;
      if (type === 'progress') {
        emit('progress', data);
        const pending = this.pending.get(requestId);
        if (pending?.onProgress) pending.onProgress(data);
        return;
      }
      const resolver = this.pending.get(requestId);
      if (resolver) {
        if (type === 'error') {
          resolver.reject(data);
        } else {
          resolver.resolve(data);
        }
        this.pending.delete(requestId);
      }
    };
  }

  _post(action, payload = {}, onProgress) {
    this._ensureWorker();
    const requestId = ++this.requestId;
    this.pending.set(requestId, { resolve: null, reject: null, onProgress });
    const promise = new Promise((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject, onProgress });
    });
    this.worker.postMessage({ requestId, action, payload });
    return promise;
  }

  async getVoices() {
    return this._post('voices');
  }

  async flush() {
    return this._post('flush');
  }

  _ensureAudioElement() {
    if (this.audio) return;
    this.audio = new Audio();
    this.audio.addEventListener('ended', () => {
      if (this.currentUrl) {
        URL.revokeObjectURL(this.currentUrl);
        this.currentUrl = null;
        this.audio.src = '';
      }
      emit('ended');
    });
    this.audio.addEventListener('pause', () => {
      // Guard against "pause after ended" which fires with currentTime === duration
      if (this.suppressNextPauseEvent) {
        this.suppressNextPauseEvent = false;
        return;
      }
      if (this.audio && this.audio.currentTime < (this.audio.duration || Infinity)) {
        emit('paused');
      }
    });
    this.audio.addEventListener('play', () => emit('playing'));
  }

  async _downloadIfNeeded(voiceId, onProgress) {
    const stored = await this._post('stored');
    const exists = (Array.isArray(stored) && stored.includes(voiceId)) || (!!stored && typeof stored === 'object' && voiceId in stored);
    if (!exists) {
      await this._post('download', { voiceId }, onProgress);
    }
  }

  async _synthesize(text, voiceId, onProgress) {
    return this._post('predict', { text, voiceId }, onProgress);
  }

  stop() {
    this.playToken += 1;
    if (this.audio) {
      this.suppressNextPauseEvent = true;
      this.audio.pause();
      this.audio.currentTime = 0;
    }
    if (this.currentUrl) {
      URL.revokeObjectURL(this.currentUrl);
      this.currentUrl = null;
      if (this.audio) this.audio.src = '';
    }
    emit('ended');
  }

  pause() {
    if (this.audio && !this.audio.paused) {
      this.audio.pause();
    }
  }

  async resume(rate = 1) {
    if (this.audio) {
      this.audio.playbackRate = rate;
      this.currentRate = rate;
      await this.audio.play();
    }
  }

  async _playBlob(blobOrBuffer, rate = 1) {
    this._ensureAudioElement();
    if (this.currentUrl) {
      URL.revokeObjectURL(this.currentUrl);
      this.currentUrl = null;
    }

    let blob = blobOrBuffer;
    if (blobOrBuffer instanceof ArrayBuffer) {
      blob = new Blob([blobOrBuffer], { type: 'audio/wav' });
    }

    this.currentUrl = URL.createObjectURL(blob);
    this.audio.src = this.currentUrl;
    this.audio.playbackRate = rate;
    this.currentRate = rate;
    await this.audio.play();
  }

  async play(text, { voiceId, fallbackVoiceId, mode, rate = 1, onProgress, token }) {
    this.playToken = token;
    this._ensureAudioElement();
    const voices = await this.getVoices();
    const voiceList = Array.isArray(voices) ? voices : [];
    const fallbackId = voiceList.includes(voiceId) ? voiceId : fallbackVoiceId;
    this.currentVoiceId = fallbackId;
    await this._downloadIfNeeded(fallbackId, onProgress);
    const wavBuffer = await this._synthesize(text, fallbackId, onProgress);
    if (this.playToken !== token) return;
    await this._playBlob(wavBuffer, rate);
    return { status: 'playing', voiceUsed: fallbackId };
  }
}
