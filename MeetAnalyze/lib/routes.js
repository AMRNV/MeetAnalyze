/**
 * lib/routes.js
 *
 * All API route handlers for MeetAnalyze.
 * Mounts onto an Express Router — imported and registered by server.js.
 *
 * Routes:
 *   POST /api/analyze                — Upload and analyze a meeting file
 *   GET  /api/result/:sessionId      — Retrieve a previously analyzed result
 *   GET  /api/export/pdf/:sessionId  — Download result as PDF
 *   GET  /api/export/docx/:sessionId — Download result as DOCX
 */

import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';

import { analyzeWithClaude } from '../api/analyze.js';
import { transcribeAudio } from '../api/transcribe.js';
import { readTextFile } from './transcript.js';
import { streamPDF, buildDOCX } from './export.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * In-memory store for analysis results.
 * Keyed by session ID (UUID), populated after each successful /api/analyze call.
 * Note: results are lost on server restart — consider a database for persistence.
 * @type {Record<string, object>}
 */
const results = {};

/**
 * Multer middleware for handling file uploads.
 * - Stores uploads in the local /uploads directory.
 * - Max file size: 20 MB (within Claude's base64 media limit).
 * - Accepted types: mp3, mp4, wav, ogg, webm, mov (audio/video) and txt, docx (text).
 */
const upload = multer({
  dest: path.join(__dirname, '..', 'uploads'),
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    if (file.originalname.match(/\.(mp3|mp4|wav|ogg|webm|mov|txt|docx)$/i)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}`));
    }
  },
});

const router = express.Router();

/**
 * POST /api/analyze
 * Accepts a single file upload (field name: "meeting"), transcribes audio/video
 * if needed, analyzes the transcript with Claude, stores the result in memory,
 * and returns the full analysis along with a session ID for later retrieval/export.
 *
 * Request: multipart/form-data with field "meeting" containing the file.
 * Response 200: { sessionId, summary, action_items, key_decisions, transcript, filename, analyzedAt }
 * Response 400: { error } — no file provided
 * Response 500: { error } — transcription or analysis failure
 */
router.post('/analyze', upload.single('meeting'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

  const sessionId = uuidv4();
  const { path: filePath, originalname } = req.file;

  try {
    let transcript = '';
    const isAudioVideo = originalname.match(/\.(mp3|mp4|wav|ogg|webm|mov)$/i);
    let analysis;

    if (isAudioVideo) {
      // Audio/video: Whisper transcribes, then Claude analyzes.
      transcript = await transcribeAudio(filePath);
      analysis = await analyzeWithClaude(transcript);
      analysis.transcript = transcript;
    } else {
      // Text/docx: extract text locally, then send to Claude for analysis.
      transcript = await readTextFile(filePath, originalname);

      if (!transcript || transcript.trim().length < 10) {
        throw new Error('Could not extract transcript from the file.');
      }

      analysis = await analyzeWithClaude(transcript);
      analysis.transcript = transcript;
    }

    analysis.filename = originalname;
    analysis.analyzedAt = new Date().toISOString();

    results[sessionId] = analysis;
    res.json({ sessionId, ...analysis });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Analysis failed.' });
  } finally {
    // Always clean up the uploaded temp file, even on error.
    fs.unlink(filePath, () => {});
  }
});

/**
 * GET /api/result/:sessionId
 * Retrieves a previously analyzed result by session ID.
 *
 * Response 200: Full analysis object.
 * Response 404: { error } — session ID not found (or server was restarted).
 */
router.get('/result/:sessionId', (req, res) => {
  const data = results[req.params.sessionId];
  if (!data) return res.status(404).json({ error: 'Result not found.' });
  res.json(data);
});

/**
 * GET /api/export/pdf/:sessionId
 * Generates and streams a formatted PDF report for the given session.
 *
 * Response 200: application/pdf (streamed attachment)
 * Response 404: { error } — session ID not found
 */
router.get('/export/pdf/:sessionId', (req, res) => {
  const data = results[req.params.sessionId];
  if (!data) return res.status(404).json({ error: 'Result not found.' });
  streamPDF(data, res);
});

/**
 * GET /api/export/docx/:sessionId
 * Generates and sends a formatted Word document (.docx) report for the given session.
 *
 * Response 200: application/vnd.openxmlformats-officedocument.wordprocessingml.document (attachment)
 * Response 404: { error } — session ID not found
 */
router.get('/export/docx/:sessionId', async (req, res) => {
  const data = results[req.params.sessionId];
  if (!data) return res.status(404).json({ error: 'Result not found.' });

  const buffer = await buildDOCX(data);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  res.setHeader('Content-Disposition', 'attachment; filename="meeting-analysis.docx"');
  res.send(buffer);
});

export default router;
