/**
 * MeetAnalyze — server.js
 *
 * App entry point. Configures Express middleware, mounts API routes,
 * serves the static frontend, and starts the HTTP server.
 *
 * Environment variables (set in .env):
 *   ANTHROPIC_API_KEY  — Anthropic API key for Claude analysis
 *   PORT               — HTTP port to listen on (default: 3000)
 *   (transcription uses locally installed Whisper CLI — no OpenAI key needed)
 */

import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import apiRoutes from './lib/routes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use('/api', apiRoutes);
app.use(express.static(path.join(__dirname, 'public')));

// Return JSON for any unhandled errors instead of Express's default HTML page.
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error.' });
});

app.listen(PORT, () => console.log(`MeetAnalyze running → http://localhost:${PORT}`));
