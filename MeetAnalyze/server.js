/**
 * MeetAnalyze — server.js
 *
 * Express server that accepts meeting audio, video, or text transcript uploads,
 * transcribes audio/video via OpenAI Whisper, analyzes the transcript with
 * Claude AI, and returns a structured summary with key decisions and action items.
 * Results can be exported as PDF or DOCX.
 *
 * Environment variables (set in .env):
 *   ANTHROPIC_API_KEY  — Anthropic API key for Claude analysis
 *   OPENAI_API_KEY     — OpenAI API key for Whisper transcription
 *   PORT               — HTTP port to listen on (default: 3000)
 *
 * API Routes:
 *   POST /api/analyze                — Upload and analyze a meeting file
 *   GET  /api/result/:sessionId      — Retrieve a previously analyzed result
 *   GET  /api/export/pdf/:sessionId  — Download result as PDF
 *   GET  /api/export/docx/:sessionId — Download result as DOCX
 */

import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import Anthropic from '@anthropic-ai/sdk';
import PDFDocument from 'pdfkit';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from 'docx';
import 'dotenv/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

/**
 * In-memory store for analysis results.
 * Keyed by session ID (UUID), populated after each successful /api/analyze call.
 * Note: results are lost on server restart — consider a database for persistence.
 * @type {Record<string, AnalysisResult>}
 */
const results = {};

// Initialize Anthropic client — the only API key required.
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/**
 * Multer middleware for handling file uploads.
 * - Stores uploads in the local /uploads directory.
 * - Max file size: 200 MB.
 * - Accepted types: mp3, mp4, wav, ogg, webm, mov (audio/video) and txt, docx (text).
 */
const upload = multer({
  dest: path.join(__dirname, 'uploads'),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB — within Claude's base64 media limit
  fileFilter(req, file, cb) {
    if (file.originalname.match(/\.(mp3|mp4|wav|ogg|webm|mov|txt|docx)$/i)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}`));
    }
  },
});

// Serve static frontend files from /public and parse JSON request bodies.
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * MIME type map for audio/video formats supported by the Claude API.
 * @type {Record<string, string>}
 */
const AUDIO_MIME_TYPES = {
  mp3:  'audio/mpeg',
  wav:  'audio/wav',
  ogg:  'audio/ogg',
  webm: 'audio/webm',
  mp4:  'video/mp4',
  mov:  'video/quicktime',
};

/**
 * Reads a plain-text or Word document and returns its content as a string.
 * @param {string} filePath - Absolute path to the uploaded file.
 * @param {string} originalname - Original filename (used to determine file type).
 * @returns {Promise<string>} Extracted text content, or empty string if unrecognized.
 */
async function readTextFile(filePath, originalname) {
  if (originalname.match(/\.txt$/i)) {
    return fs.readFileSync(filePath, 'utf8');
  }
  if (originalname.match(/\.docx$/i)) {
    const { default: mammoth } = await import('mammoth');
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value;
  }
  return '';
}

/**
 * Analyzes a meeting transcript with Claude and returns structured results.
 * @param {string} transcript - The full meeting transcript text.
 * @returns {Promise<{ summary: string, action_items: ActionItem[], key_decisions: string[] }>}
 * @typedef {{ owner: string, task: string, due_date: string|null }} ActionItem
 */
async function analyzeWithClaude(transcript) {
  const message = await anthropic.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 2048,
    messages: [{
      role: 'user',
      content: `You are an expert meeting analyst. Analyze the following meeting transcript and produce a structured JSON response with exactly these keys:

- "summary": A concise 3-5 sentence paragraph summarizing the meeting's purpose, main topics, and outcomes.
- "action_items": An array of objects, each with "owner" (person responsible, or "Unassigned"), "task" (what needs to be done), and "due_date" (if mentioned, else null).
- "key_decisions": An array of strings, each describing an important decision made during the meeting.

Respond with valid JSON only — no markdown fences, no extra text.

TRANSCRIPT:
${transcript}`,
    }],
  });

  return JSON.parse(message.content[0].text.trim());
}

/**
 * Sends an audio/video file directly to Claude for transcription + analysis in one pass.
 * Eliminates the need for a separate Whisper transcription step.
 * @param {string} filePath - Absolute path to the audio/video file.
 * @param {string} originalname - Original filename (used to determine MIME type).
 * @returns {Promise<{ analysis: object, transcript: string }>}
 */
async function transcribeAndAnalyzeWithClaude(filePath, originalname) {
  const ext = originalname.split('.').pop().toLowerCase();
  const mediaType = AUDIO_MIME_TYPES[ext] || 'audio/mpeg';
  const audioData = fs.readFileSync(filePath).toString('base64');

  const message = await anthropic.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 4096,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'document',
          source: { type: 'base64', media_type: mediaType, data: audioData },
        },
        {
          type: 'text',
          text: `You are an expert meeting analyst. First, transcribe the audio, then analyze it and produce a structured JSON response with exactly these keys:

- "transcript": The full verbatim transcription of the audio.
- "summary": A concise 3-5 sentence paragraph summarizing the meeting's purpose, main topics, and outcomes.
- "action_items": An array of objects, each with "owner" (person responsible, or "Unassigned"), "task" (what needs to be done), and "due_date" (if mentioned, else null).
- "key_decisions": An array of strings, each describing an important decision made during the meeting.

Respond with valid JSON only — no markdown fences, no extra text.`,
        },
      ],
    }],
  });

  return JSON.parse(message.content[0].text.trim());
}

// ── Routes ────────────────────────────────────────────────────────────────────

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
app.post('/api/analyze', upload.single('meeting'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

  const sessionId = uuidv4();
  const { path: filePath, originalname } = req.file;

  try {
    let transcript = '';
    const isAudioVideo = originalname.match(/\.(mp3|mp4|wav|ogg|webm|mov)$/i);
    let analysis;

    if (isAudioVideo) {
      // Audio/video: Claude transcribes and analyzes in one API call.
      analysis = await transcribeAndAnalyzeWithClaude(filePath, originalname);
      transcript = analysis.transcript;
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
app.get('/api/result/:sessionId', (req, res) => {
  const data = results[req.params.sessionId];
  if (!data) return res.status(404).json({ error: 'Result not found.' });
  res.json(data);
});

// ── Export: PDF ───────────────────────────────────────────────────────────────

/**
 * GET /api/export/pdf/:sessionId
 * Generates and streams a formatted PDF report for the given session.
 * Sections: title/metadata, Summary, Key Decisions, Action Items.
 *
 * Response 200: application/pdf (streamed attachment)
 * Response 404: { error } — session ID not found
 */
app.get('/api/export/pdf/:sessionId', (req, res) => {
  const data = results[req.params.sessionId];
  if (!data) return res.status(404).json({ error: 'Result not found.' });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="meeting-analysis.pdf"');

  const doc = new PDFDocument({ margin: 50 });
  doc.pipe(res);

  doc.fontSize(22).font('Helvetica-Bold').text('Meeting Analysis Report', { align: 'center' });
  doc.moveDown(0.5);
  doc.fontSize(10).font('Helvetica').fillColor('#666')
    .text(`File: ${data.filename}   |   Analyzed: ${new Date(data.analyzedAt).toLocaleString()}`, { align: 'center' });
  doc.moveDown(1.5);

  doc.fontSize(14).font('Helvetica-Bold').fillColor('#1a1a1a').text('Summary');
  doc.moveTo(50, doc.y).lineTo(562, doc.y).strokeColor('#ddd').stroke();
  doc.moveDown(0.4);
  doc.fontSize(11).font('Helvetica').fillColor('#333').text(data.summary, { lineGap: 4 });
  doc.moveDown(1.5);

  doc.fontSize(14).font('Helvetica-Bold').fillColor('#1a1a1a').text('Key Decisions');
  doc.moveTo(50, doc.y).lineTo(562, doc.y).strokeColor('#ddd').stroke();
  doc.moveDown(0.4);
  (data.key_decisions || []).forEach((d, i) => {
    doc.fontSize(11).font('Helvetica').fillColor('#333')
      .text(`${i + 1}.  ${d}`, { indent: 10, lineGap: 3 });
  });
  doc.moveDown(1.5);

  doc.fontSize(14).font('Helvetica-Bold').fillColor('#1a1a1a').text('Action Items');
  doc.moveTo(50, doc.y).lineTo(562, doc.y).strokeColor('#ddd').stroke();
  doc.moveDown(0.4);
  (data.action_items || []).forEach((item, i) => {
    const due = item.due_date ? `  (due: ${item.due_date})` : '';
    doc.fontSize(11).font('Helvetica-Bold').fillColor('#333')
      .text(`${i + 1}.  ${item.owner}`, { continued: true, indent: 10 });
    doc.font('Helvetica').text(`  —  ${item.task}${due}`, { lineGap: 3 });
  });

  doc.end();
});

// ── Export: DOCX ──────────────────────────────────────────────────────────────

/**
 * GET /api/export/docx/:sessionId
 * Generates and sends a formatted Word document (.docx) report for the given session.
 * Sections: title/metadata, Summary, Key Decisions, Action Items.
 *
 * Response 200: application/vnd.openxmlformats-officedocument.wordprocessingml.document (attachment)
 * Response 404: { error } — session ID not found
 */
app.get('/api/export/docx/:sessionId', async (req, res) => {
  const data = results[req.params.sessionId];
  if (!data) return res.status(404).json({ error: 'Result not found.' });

  const children = [
    new Paragraph({ text: 'Meeting Analysis Report', heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER }),
    new Paragraph({
      children: [new TextRun({ text: `File: ${data.filename}   |   Analyzed: ${new Date(data.analyzedAt).toLocaleString()}`, color: '666666', size: 20 })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 300 },
    }),
    new Paragraph({ text: 'Summary', heading: HeadingLevel.HEADING_1 }),
    new Paragraph({ text: data.summary, spacing: { after: 300 } }),
    new Paragraph({ text: 'Key Decisions', heading: HeadingLevel.HEADING_1 }),
    ...(data.key_decisions || []).map((d, i) =>
      new Paragraph({ text: `${i + 1}.  ${d}`, spacing: { after: 100 } })
    ),
    new Paragraph({ text: '' }),
    new Paragraph({ text: 'Action Items', heading: HeadingLevel.HEADING_1 }),
    ...(data.action_items || []).map((item, i) => {
      const due = item.due_date ? `  (due: ${item.due_date})` : '';
      return new Paragraph({
        children: [
          new TextRun({ text: `${i + 1}.  ${item.owner}`, bold: true }),
          new TextRun({ text: `  —  ${item.task}${due}` }),
        ],
        spacing: { after: 100 },
      });
    }),
  ];

  const doc = new Document({ sections: [{ children }] });
  const buffer = await Packer.toBuffer(doc);

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  res.setHeader('Content-Disposition', 'attachment; filename="meeting-analysis.docx"');
  res.send(buffer);
});

app.listen(PORT, () => console.log(`MeetAnalyze running → http://localhost:${PORT}`));
