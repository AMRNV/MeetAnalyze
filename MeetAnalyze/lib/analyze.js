/**
 * lib/analyze.js
 *
 * Claude AI helpers for meeting analysis.
 * Handles both text transcripts and audio/video files (transcribe + analyze in one pass).
 */

import fs from 'fs';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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
 * Analyzes a meeting transcript with Claude and returns structured results.
 * @param {string} transcript - The full meeting transcript text.
 * @returns {Promise<{ summary: string, action_items: ActionItem[], key_decisions: string[] }>}
 * @typedef {{ owner: string, task: string, due_date: string|null }} ActionItem
 */
export async function analyzeWithClaude(transcript) {
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
 * @returns {Promise<{ transcript: string, summary: string, action_items: ActionItem[], key_decisions: string[] }>}
 */
export async function transcribeAndAnalyzeWithClaude(filePath, originalname) {
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
