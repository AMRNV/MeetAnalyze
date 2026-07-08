/**
 * lib/analyze.js
 *
 * Claude AI helper for analyzing a meeting transcript.
 * Expects plain text in, returns structured JSON out.
 */

import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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
