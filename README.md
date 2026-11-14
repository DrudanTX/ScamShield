# Scam Shield

Run locally with Node.js 22 or newer.

1. Run `npm ci`.
2. Copy `.env.example` to `.env` and add your Gemini and Deepgram API keys.
3. Run `npm start` and open [Scam Shield](http://localhost:3000).

Paste a transcript and select **Analyze transcript**, or play the bundled sample call. Gemini scores the pasted text or the latest 30 seconds of timestamped audio transcript. Checks run every four seconds when the previous check has finished. Each matched keyword adds two points, up to ten total. The final score is capped at 100. One score of 75 or above opens the alert.

Gemini responses and errors appear in the server terminal. Open [the health endpoint](http://localhost:3000/health) to make one small test request. Set `GEMINI_MODEL` in `.env` to change the default Flash model, `gemini-2.5-flash`.

## Microphone

Click **Listen**, grant microphone access, and put the call on speaker. Use **Stop** to release the microphone and screen wake lock. Audio is forwarded to Deepgram and is not saved by the app.

Browsers allow microphone access on HTTP localhost. For other hostnames, use HTTPS with a browser-trusted certificate. Set `TLS_CERT_FILE` and `TLS_KEY_FILE` in `.env` to serve HTTPS directly, or terminate HTTPS at a reverse proxy that forwards WebSocket upgrades. Set `APP_ORIGIN` to the exact external origin, including any nonstandard port, when using a custom hostname or proxy.

Gemini highlights flagged phrases in the live transcript. The spoken warning plays when the red alert opens. Use **Mute voice warnings** to turn it off. Listen mode pauses scoring and sends silence during the warning and for one second afterward.

## Hackathon demo

Use **Synthetic scam call** to show a verification-code request, then dismiss the alert and choose **Ordinary appointment reminder** to show the result clearing. Both use bundled transcripts and the real Gemini scorer. **Play sample call** streams audio through Deepgram and switches to its labeled bundled transcript if audio transcription fails. **Reset** clears the current scan.
