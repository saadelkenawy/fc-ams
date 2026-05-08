import PDFDocument from 'pdfkit';
import type { Readable } from 'stream';

export interface PdfColumn<T> {
  header: string;
  key: keyof T;
  width: number;
  format?: (val: unknown) => string;
}

export interface ReportOptions<T> {
  title:    string;
  subtitle: string;
  columns:  PdfColumn<T>[];
  rows:     T[];
  summary?: { label: string; value: string }[];
  rtl?:     boolean;
}

export function buildPdf<T extends Record<string, unknown>>(opts: ReportOptions<T>): Readable {
  const doc = new PDFDocument({ size: 'A4', margin: 40, info: { Title: opts.title } });

  const RED   = '#DC2626';
  const GRAY  = '#6B7280';
  const DARK  = '#111827';
  const LIGHT = '#F9FAFB';
  const W     = 515; // usable width

  // Header bar
  doc.rect(40, 40, W, 50).fill(RED);
  doc.fillColor('white').fontSize(16).font('Helvetica-Bold')
     .text('FADL CLINIC — فضل كلينك', 55, 52);
  doc.fillColor('white').fontSize(9).font('Helvetica')
     .text(opts.subtitle, 55, 72);

  // Title
  doc.moveDown(2);
  doc.fillColor(DARK).fontSize(14).font('Helvetica-Bold').text(opts.title, { align: 'center' });
  doc.moveDown(0.5);
  doc.fillColor(GRAY).fontSize(9).font('Helvetica')
     .text(`Generated: ${new Date().toLocaleString('en-US')}`, { align: 'center' });
  doc.moveDown(1);

  // Summary cards
  if (opts.summary?.length) {
    const cardW = (W - (opts.summary.length - 1) * 8) / opts.summary.length;
    let x = 40;
    const y = doc.y;
    opts.summary.forEach((s) => {
      doc.rect(x, y, cardW, 44).fill(LIGHT);
      doc.fillColor(GRAY).fontSize(8).font('Helvetica').text(s.label, x + 6, y + 6, { width: cardW - 12 });
      doc.fillColor(DARK).fontSize(12).font('Helvetica-Bold').text(s.value, x + 6, y + 20, { width: cardW - 12 });
      x += cardW + 8;
    });
    doc.moveDown(3.5);
  }

  // Table header
  const colStarts: number[] = [];
  let cx = 40;
  opts.columns.forEach((col) => { colStarts.push(cx); cx += col.width; });

  const tableTop = doc.y;
  doc.rect(40, tableTop, W, 20).fill(RED);
  opts.columns.forEach((col, i) => {
    doc.fillColor('white').fontSize(8).font('Helvetica-Bold')
       .text(col.header, colStarts[i] + 4, tableTop + 6, { width: col.width - 8 });
  });

  // Table rows
  let rowY = tableTop + 20;
  opts.rows.forEach((row, ri) => {
    const rowH = 18;
    if (ri % 2 === 0) doc.rect(40, rowY, W, rowH).fill('#F3F4F6');
    opts.columns.forEach((col, i) => {
      const raw = row[col.key as string];
      const text = col.format ? col.format(raw) : String(raw ?? '');
      doc.fillColor(DARK).fontSize(8).font('Helvetica')
         .text(text, colStarts[i] + 4, rowY + 5, { width: col.width - 8, lineBreak: false });
    });
    rowY += rowH;
    if (rowY > 760) { doc.addPage(); rowY = 40; }
  });

  // Footer
  doc.moveDown(2);
  doc.fillColor(GRAY).fontSize(8).font('Helvetica')
     .text('Fadl Clinic — Confidential Medical Document', 40, 790, { align: 'center', width: W });

  doc.end();
  return doc as unknown as Readable;
}
