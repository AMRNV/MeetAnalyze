# MeetAnalyze

AI-powered meeting analysis. Upload a recording or transcript and get a structured summary, key decisions, and action items — exported as PDF or Word.

## What it does

- **Audio/video** (mp3, wav, ogg, webm, mp4, mov) → transcribed locally via [OpenAI Whisper](https://github.com/openai/whisper)
- **Transcripts** (.txt, .docx) → read directly
- Transcript sent to **Claude AI** → returns summary, key decisions, and action items with owners and due dates
- Results exportable as **PDF** or **Word (.docx)**

## Requirements

- Node.js 18+
- [Whisper](https://github.com/openai/whisper) CLI installed locally (for audio/video files)
- [ffmpeg](https://ffmpeg.org/) (required by Whisper)
- Anthropic API key

## Setup

```powershell
npm install
copy .env.example .env
# Fill in .env (see below)
node server.js
```

Open `http://localhost:3000`.

## Environment variables

| Variable | Description |
|---|---|
| `ANTHROPIC_API_KEY` | Required. Get one at [console.anthropic.com](https://console.anthropic.com) |
| `PORT` | HTTP port (default: `3000`) |
| `WHISPER_PATH` | Full path to `whisper.exe` — required on Windows (not on Node PATH) |
| `FFMPEG_PATH` | Full path to `ffmpeg.exe` — required on Windows (not on Node PATH) |

## Development

```powershell
npm run dev   # auto-reload via nodemon
```

## Architecture

```
server.js          Express entry point — middleware, mounts /api, serves public/
lib/routes.js      Multer upload (100 MB limit) → dispatches to transcribe or transcript
api/transcribe.js  Copies upload to temp dir, spawns Whisper CLI, reads .txt output
lib/transcript.js  Extracts text from .txt / .docx (mammoth)
api/analyze.js     Sends transcript to Claude, parses JSON response
lib/export.js      PDF (pdfkit) and DOCX generation for export routes
public/index.html  Single-page UI with drag-and-drop upload
```

Results are stored **in memory only** — lost on server restart.

## Windows notes

- `WHISPER_PATH` and `FFMPEG_PATH` must be set to full paths — they are not on Node's PATH.
- Files with spaces in their path are automatically copied to `os.tmpdir()` before Whisper runs.
