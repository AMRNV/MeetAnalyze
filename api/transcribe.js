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
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-'));

  // Whisper/ffmpeg fail on paths with spaces — copy the file into the temp dir first.
  const safeInput = path.join(workDir, 'input' + path.extname(filePath));
  fs.copyFileSync(filePath, safeInput);

  try {
    const whisperBin = process.env.WHISPER_PATH || 'whisper';

    // Point ffmpeg to its installed location so Whisper can find it.
    const ffmpegDir = process.env.FFMPEG_PATH
      ? path.dirname(process.env.FFMPEG_PATH)
      : 'C:\\Users\\Alex\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-8.1.1-full_build\\bin';

    await execFileAsync(whisperBin, [
      safeInput,
      '--model', model,
      '--output_format', 'txt',
      '--output_dir', workDir,
      '--language', 'en',
    ], {
      env: { ...process.env, PATH: `${ffmpegDir};${process.env.PATH}` },
    });

    const txtFile = fs.readdirSync(workDir).find(f => f.endsWith('.txt'));
    if (!txtFile) throw new Error('Whisper did not produce a transcript file.');
    return fs.readFileSync(path.join(workDir, txtFile), 'utf8').trim();
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}
