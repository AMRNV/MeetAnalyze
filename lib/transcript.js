/**
 * lib/transcript.js
 *
 * Helpers for extracting plain text from uploaded transcript files.
 * Supports .txt (read directly) and .docx (via mammoth).
 */

import fs from 'fs';

/**
 * Reads a plain-text or Word document and returns its content as a string.
 * @param {string} filePath - Absolute path to the uploaded file.
 * @param {string} originalname - Original filename (used to determine file type).
 * @returns {Promise<string>} Extracted text content, or empty string if unrecognized.
 */
export async function readTextFile(filePath, originalname) {
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
