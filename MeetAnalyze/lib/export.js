/**
 * lib/export.js
 *
 * Helpers for generating PDF and DOCX export files from a meeting analysis result.
 */

import PDFDocument from 'pdfkit';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from 'docx';

/**
 * Streams a formatted PDF report to an Express response object.
 * Sections: title/metadata, Summary, Key Decisions, Action Items.
 * @param {object} data - Analysis result object.
 * @param {import('express').Response} res - Express response to pipe the PDF into.
 */
export function streamPDF(data, res) {
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
}

/**
 * Builds and returns a DOCX report buffer from a meeting analysis result.
 * Sections: title/metadata, Summary, Key Decisions, Action Items.
 * @param {object} data - Analysis result object.
 * @returns {Promise<Buffer>} The generated .docx file as a Buffer.
 */
export async function buildDOCX(data) {
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
  return Packer.toBuffer(doc);
}
