# Voice Mode Sandbox

A minimal sandbox for testing three playback modes: **Fastest** (Web Speech API), **Balanced**, and **Best** (neural voices via `@mintplex-labs/piper-tts-web`). The UI offers play/pause/resume/stop controls, download progress, and robust fallback handling.

## Features
- Textarea with sample text helper.
- Mode selector with Fastest/Balanced/Best.
- System voice dropdown for Fastest (Web Speech API).
- Rate control (0.75x–1.5x) affecting both engines.
- Progress + status for downloading and synthesis.
- Modal fallback to Fastest if neural modes fail.
- Debug tools for listing voices, clearing cache, and overriding voice IDs.

## Getting started
```bash
npm install
npm run dev
```

Then open the printed local URL from Vite (usually http://localhost:5173).

## Quick test checklist
- **Fastest**: pick a system voice, play text, verify pause/resume/stop.
- **Balanced**: first play downloads the voice pack and shows progress; later plays reuse cache.
- **Best**: plays with the high-quality voice or falls back to balanced ID if missing.
- **Failure fallback**: set Best voice ID to an invalid value, play -> modal appears, mode switches to Fastest, text reads via Web Speech API.
- **Stop during prep**: press Stop while downloading/synthesizing; audio should never start afterwards.

## Notes
- Balanced voiceId default: `en_US-ljspeech-medium`.
- Best voiceId default: `en_US-ljspeech-high` (auto-falls back to balanced if unavailable).
- Neural voices download on first use and are cached in browser storage; cache can be cleared via the debug tool.
- Piper synthesis runs in a Web Worker, and playback uses an in-page audio element (object URLs) to support pause/resume/stop.
- LJSpeech voices are public-domain sourced, but always verify model and dependency licensing for your deployment.
