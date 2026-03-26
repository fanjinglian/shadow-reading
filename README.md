# Shadow Reading MVP

WeChat mini program + FastAPI backend for sentence-by-sentence shadowing practice described in `Shadow Reading（影子跟读）MVP PRD.md`.

## Structure

```
.
├── miniprogram/        # WX mini program source
│   └── pages/
│       ├── input/      # text entry and session start
│       ├── shadowing/  # listen → repeat → next drill loop
│       └── result/     # lightweight completion feedback
└── backend/            # FastAPI placeholder service
```

## Prerequisites
- [WeChat DevTools](https://developers.weixin.qq.com/miniprogram/en/dev/devtools/download.html)
- Node.js 18+ (for tooling/miniprogram npm packages if you add them later)
- Python 3.10+ for the FastAPI service

## Running the backend

1. Create and activate a virtualenv
   ```bash
   cd backend
   python -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   ```
2. Copy `.env.example` → `.env` and (optional) tweak Edge TTS voice/rate/volume or audio retention values. The default configuration uses Microsoft's free Edge TTS service, so you can leave Azure credentials blank for local development.
3. Start FastAPI
   ```bash
   uvicorn app.main:app --reload
   ```

The server listens on `http://127.0.0.1:8000` and exposes:
- `POST /split` – text segmentation + keyword picks
- `POST /tts` – Edge TTS (en‑GB voice) that stores mp3 files under `generated_audio/` and serves them via `/media/audio/<file>`
- `GET /word-tts` – cached single-word TTS optimized for the popup pronunciation cards
- `GET /phonetic` – English IPA via `eng_to_ipa` (cached in memory)

Update `miniprogram/utils/api.js` if you deploy elsewhere.

### Tests & monitoring
- Run `pytest` inside the `backend/` directory to validate `/split`, `/tts`, `/phonetic`, and audio cleanup logic.
- FastAPI endpoints now emit basic structured logs (request durations, cleanup counts). Tail your server logs to monitor performance.

## Running the mini program
1. Open WeChat DevTools, choose "Mini Program" → "Import".
2. Select this folder and use `touristappid` while waiting for your real AppID.
3. Update `BASE_URL` inside `miniprogram/utils/api.js` if your backend host differs.
4. Use the built-in simulator or a connected device for testing audio playback.

## Next steps
- Replace stubbed TTS + IPA logic in the backend with your production services (Azure Edge TTS, dictionary API, etc.).
- Connect persistent storage if you want to record learning history beyond this MVP.
- Add automated tests (unit + e2e) once flows stabilize.
