const PIPER_MODULE_URL =
  'https://cdn.jsdelivr.net/npm/@mintplex-labs/piper-tts-web@1.0.4/dist/index.mjs';

let clientPromise = null;

async function getClient() {
  if (!clientPromise) {
    clientPromise = import(PIPER_MODULE_URL).then((mod) => {
      if (typeof mod.predict !== 'function' || typeof mod.download !== 'function') {
        throw new Error('piper-tts-web API mismatch: missing predict()/download() exports');
      }
      return mod;
    });
  }
  return clientPromise;
}

async function handleVoices() {
  const tts = await getClient();
  if (typeof tts.voices === 'function') {
    const voices = await tts.voices();
    if (Array.isArray(voices)) {
      return voices
        .map((v) => {
          if (typeof v === 'string') return v;
          return v?.key || v?.id || v?.voiceId || null;
        })
        .filter(Boolean);
    }
    if (voices && typeof voices === 'object') return Object.keys(voices);
    return [];
  }
  return [];
}

async function handleStored() {
  const tts = await getClient();
  if (typeof tts.stored === 'function') {
    return tts.stored();
  }
  return [];
}

async function handleDownload(voiceId, requestId) {
  const tts = await getClient();
  if (typeof tts.download === 'function') {
    await tts.download(voiceId, (info) => {
      const percent = typeof info === 'number' ? info : (info?.total ? (info.loaded / info.total) * 100 : 0);
      postMessage({ requestId, type: 'progress', data: { stage: 'download', percent: Math.round(percent) } });
    });
    return true;
  }
  if (typeof tts.prepare === 'function') {
    await tts.prepare(voiceId, (info) => {
      const percent = typeof info === 'number' ? info : (info?.total ? (info.loaded / info.total) * 100 : 0);
      postMessage({ requestId, type: 'progress', data: { stage: 'download', percent: Math.round(percent) } });
    });
    return true;
  }
  throw new Error('Download not supported');
}

async function handlePredict({ text, voiceId }, requestId) {
  const tts = await getClient();
  if (typeof tts.predict === 'function') {
    const result = await tts.predict({ text, voiceId }, (info) => {
      const percent = typeof info === 'number' ? info : (info?.total ? (info.loaded / info.total) * 100 : 0);
      postMessage({ requestId, type: 'progress', data: { stage: 'predict', percent: Math.round(percent) } });
    });
    if (result instanceof Blob) return result;
    if (result instanceof ArrayBuffer) return result;
    if (result?.arrayBuffer) return result.arrayBuffer();
    throw new Error('Unsupported predict return type');
  }
  if (typeof tts.speak === 'function') {
    const result = await tts.speak(text, voiceId, (info) => {
      const percent = typeof info === 'number' ? info : (info?.total ? (info.loaded / info.total) * 100 : 0);
      postMessage({ requestId, type: 'progress', data: { stage: 'predict', percent: Math.round(percent) } });
    });
    if (result instanceof Blob) return result;
    if (result instanceof ArrayBuffer) return result;
    if (result?.arrayBuffer) return result.arrayBuffer();
    throw new Error('Unsupported predict return type');
  }
  throw new Error('Predict not supported');
}

async function handleFlush() {
  const tts = await getClient();
  if (typeof tts.flush === 'function') {
    return tts.flush();
  }
  return true;
}

self.onmessage = async (event) => {
  const { requestId, action, payload } = event.data;
  try {
    switch (action) {
      case 'voices': {
        const voices = await handleVoices();
        postMessage({ requestId, type: 'response', data: voices });
        break;
      }
      case 'stored': {
        const stored = await handleStored();
        postMessage({ requestId, type: 'response', data: stored });
        break;
      }
      case 'download': {
        const ok = await handleDownload(payload.voiceId, requestId);
        postMessage({ requestId, type: 'response', data: ok });
        break;
      }
      case 'predict': {
        const wav = await handlePredict(payload, requestId);
        if (wav instanceof ArrayBuffer) {
          postMessage({ requestId, type: 'response', data: wav }, [wav]);
        } else {
          postMessage({ requestId, type: 'response', data: wav });
        }
        break;
      }
      case 'flush': {
        const okFlush = await handleFlush();
        postMessage({ requestId, type: 'response', data: okFlush });
        break;
      }
      default:
        throw new Error(`Unknown action: ${action}`);
    }
  } catch (err) {
    postMessage({ requestId, type: 'error', data: err?.message || String(err) });
  }
};
