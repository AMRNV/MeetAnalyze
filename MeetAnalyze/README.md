# MeetAnalyze

AI-powered meeting analysis. Upload an audio recording, video, or text transcript and get back a structured summary, key decisions, and action items — powered by Claude AI and OpenAI Whisper.

## Features

- **Audio/Video transcription** via OpenAI Whisper (mp3, wav, mp4, ogg, webm, mov)
- **Text transcript** support (txt, docx)
- **Claude AI analysis** — summary, key decisions, action items with owners
- **Export** to PDF or Word (.docx)
- Dark-mode web UI with drag-and-drop upload

## Setup

```bash
npm install
cp .env.example .env   # add your API keys
```

| Variable | Where to get it |
|---|---|
| `ANTHROPIC_API_KEY` | https://console.anthropic.com |
| `OPENAI_API_KEY` | https://platform.openai.com (Whisper transcription) |

```bash
# Start the server
npx dotenv -e .env -- node server.js

# Dev mode (auto-reload)
npx dotenv -e .env -- npx nodemon server.js
```

Open **http://localhost:3000** in your browser.

> If you only use text transcripts (no audio/video), only `ANTHROPIC_API_KEY` is required.
