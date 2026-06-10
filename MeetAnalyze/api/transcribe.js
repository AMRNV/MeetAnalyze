/**
 * lib/transcribe.js
 *
 * Whisper transcription helper using a locally installed Whisper CLI.
 * Requires Whisper to be installed: pip install openai-whisper
 *
 * No API key needed — runs entirely on your machine.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';

const execFileAsync = promisify(execFile);

/**
 * Transcribes an audio or video file using the local Whisper CLI.
 * Whisper writes a .txt file next to the output; this helper reads and returns it.
 *
 * @param {string} filePath - Absolute path to the audio/video file.
 * @param {string} [model='small'] - Whisper model to use: tiny, base, small, medium, large.
 * @returns {Promise<string>} Plain-text transcription.
 */
export async function transcribeAudio(filePath, model = 'small') {
  // Use a temp directory so Whisper's output files don't land in /uploads.
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-'));

  try {
    await execFileAsync('whisper', [
      filePath,
      '--model', model,
      '--output_format', 'txt',
      '--output_dir', outDir,
      '--language', 'en',
    ]);

    // Whisper names the output file after the input filename, e.g. "abc123.txt"
    const baseName = path.basename(filePath, path.extname(filePath));
    const txtPath = path.join(outDir, `${baseName}.txt`);
    return fs.readFileSync(txtPath, 'utf8').trim();
  } finally {
    // Clean up the temp output directory.
    fs.rmSync(outDir, { recursive: true, force: true });
  }
}
