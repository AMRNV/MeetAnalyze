# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```powershell
# Install dependencies
npm install

# Run server
node server.js

# Dev mode (auto-reload)
npx nodemon server.js
```

The server reads `.env` automatically via `dotenv/config`. Copy `.env.example` to `.env` and fill in keys before first run.

## Environment Variables

| Variable | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Claude analysis (required) |
| `PORT` | HTTP port (default: 3000) |
| `WHISPER_PATH` | Full path to `whisper.exe` (required on Windows — it won't be on the Node PATH) |
| `FFMPEG_PATH` | Full path to `ffmpeg.exe` (required on Windows for the same reason) |

## Architecture

The project is an ES module (`"type": "module"`) Node.js/Express app. `server.js` is the entry point — it only configures middleware, mounts the router at `/api`, serves `public/` as static, and starts listening.

**Request flow for audio/video uploads:**
1. `lib/routes.js` — multer receives the upload (100 MB limit), saves to `uploads/`
2. `api/transcribe.js` — copies the file to a no-spaces temp dir, spawns the local Whisper CLI, reads back the `.txt` output, cleans up
3. `api/analyze.js` — sends the transcript text to Claude (`claude-opus-4-5`) and parses the JSON response
4. Result stored in the in-memory `results` object keyed by UUID session ID
5. Export routes (`/api/export/pdf/:id`, `/api/export/docx/:id`) read from `results` and stream the file

**Request flow for text/docx uploads:**
Steps 1 → `lib/transcript.js` (mammoth for .docx, fs.readFileSync for .txt) → step 3 onwards.

## Key Constraints

- **Results are in-memory only** — lost on server restart. No database.
- **Whisper on Windows**: paths with spaces cause Whisper/ffmpeg to fail. `api/transcribe.js` copies the upload to `os.tmpdir()` before invoking Whisper. If adding any Whisper-related code, keep this in mind.
- **ffmpeg is not on Node's PATH on Windows** — `api/transcribe.js` injects `FFMPEG_PATH` (or a hardcoded fallback) into the child process env. If ffmpeg is moved or updated, update `FFMPEG_PATH` in `.env`.
- **Claude response must be pure JSON** — the prompt explicitly instructs Claude to return no markdown fences. If the model is changed, verify it still respects this.
- The `openai` npm package is still installed but unused — Whisper runs locally via CLI, not the OpenAI API.
