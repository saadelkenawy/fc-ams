import PDFDocument from 'pdfkit';
import { LOGO_BASE64 } from './pdf-assets';

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
  reportTo?: { label: string; value: string }[];
  rtl?:     boolean;
}

export interface InvoiceOptions {
  invoiceId:   string;
  date:        string;
  patientName: string;
  doctorName:  string;
  visitType:   string;
  charge:      number;
  sourceFee:   number;
  vatRate:     number;
  paymentMethod: string;
  status:      string;
  isRefund:    boolean;
  refundReason?: string;
}

function collectStream(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
}

function drawHeader(doc: PDFKit.PDFDocument, W: number, marginLeft: number) {
  const RED = '#DC2626';

  // Red header bar
  doc.rect(marginLeft, marginLeft, W, 58).fill(RED);

  // Logo — fit within 120×32 in the left portion of the header
  try {
    const logoBuffer = Buffer.from(LOGO_BASE64, 'base64');
    doc.image(logoBuffer, marginLeft + 12, marginLeft + 13, { width: 120, height: 32 });
  } catch {
    doc.fillColor('white').fontSize(16).font('Helvetica-Bold')
       .text('FADL CLINIC', marginLeft + 12, marginLeft + 20);
  }

  // Clinic address on the right
  doc.fillColor('white').fontSize(8).font('Helvetica')
     .text('12 El-Tahrir St., Cairo', marginLeft + W - 170, marginLeft + 14, { width: 158, align: 'right' })
     .text('+20 2 2345 6789  |  info@fadlclinic.com', marginLeft + W - 170, marginLeft + 28, { width: 158, align: 'right' })
     .text('فضل كلينك', marginLeft + W - 170, marginLeft + 42, { width: 158, align: 'right' });
}

export async function buildPdf<T extends Record<string, unknown>>(opts: ReportOptions<T>): Promise<Buffer> {
  const ML   = 40;
  const doc  = new PDFDocument({ size: 'A4', margin: ML, info: { Title: opts.title } });

  const RED   = '#DC2626';
  const GRAY  = '#6B7280';
  const DARK  = '#111827';
  const LIGHT = '#F9FAFB';
  const W     = 515;

  drawHeader(doc, W, ML);

  // Report title block
  doc.moveDown(3.5);
  const titleY = doc.y;
  doc.fillColor(DARK).fontSize(13).font('Helvetica-Bold').text(opts.title, ML, titleY);
  doc.fillColor(GRAY).fontSize(9).font('Helvetica')
     .text(opts.subtitle, ML, titleY + 18);
  doc.fillColor(GRAY).fontSize(8).font('Helvetica')
     .text(`Generated: ${new Date().toLocaleString('en-US')}`, ML, titleY + 32);

  doc.moveDown(3.5);

  // "REPORT TO" info box (doctor name, period, etc.)
  if (opts.reportTo?.length) {
    const boxY = doc.y;
    const boxH = 14 + opts.reportTo.length * 16;
    doc.rect(ML, boxY, W, boxH).fill(LIGHT);
    doc.fillColor(GRAY).fontSize(7).font('Helvetica-Bold')
       .text('SETTLEMENT DETAILS', ML + 12, boxY + 8);
    opts.reportTo.forEach((item, idx) => {
      const ly = boxY + 22 + idx * 16;
      doc.fillColor(GRAY).fontSize(8).font('Helvetica')
         .text(`${item.label}:`, ML + 12, ly, { continued: true })
         .fillColor(DARK).font('Helvetica-Bold')
         .text(`  ${item.value}`, { lineBreak: false });
    });
    doc.y = boxY + boxH + 10;
    doc.moveDown(0.5);
  }

  // Summary cards
  if (opts.summary?.length) {
    const cardW = (W - (opts.summary.length - 1) * 8) / opts.summary.length;
    let x = ML;
    const y = doc.y;
    opts.summary.forEach((s) => {
      doc.rect(x, y, cardW, 46).fill(LIGHT);
      doc.rect(x, y, 3, 46).fill(RED);
      doc.fillColor(GRAY).fontSize(7).font('Helvetica').text(s.label, x + 8, y + 7, { width: cardW - 16 });
      doc.fillColor(DARK).fontSize(12).font('Helvetica-Bold').text(s.value, x + 8, y + 20, { width: cardW - 16 });
      x += cardW + 8;
    });
    doc.y = y + 46 + 12;
  }

  // Table header
  const colStarts: number[] = [];
  let cx = ML;
  opts.columns.forEach((col) => { colStarts.push(cx); cx += col.width; });

  const tableTop = doc.y;
  doc.rect(ML, tableTop, W, 22).fill(RED);
  opts.columns.forEach((col, i) => {
    doc.fillColor('white').fontSize(8).font('Helvetica-Bold')
       .text(col.header, colStarts[i] + 4, tableTop + 7, { width: col.width - 8 });
  });

  // Table rows
  let rowY = tableTop + 22;
  opts.rows.forEach((row, ri) => {
    const rowH = 18;
    if (ri % 2 === 0) doc.rect(ML, rowY, W, rowH).fill('#F3F4F6');
    opts.columns.forEach((col, i) => {
      const raw  = row[col.key as string];
      const text = col.format ? col.format(raw) : String(raw ?? '');
      doc.fillColor(DARK).fontSize(8).font('Helvetica')
         .text(text, colStarts[i] + 4, rowY + 5, { width: col.width - 8, lineBreak: false });
    });
    rowY += rowH;
    if (rowY > 760) { doc.addPage(); rowY = ML; }
  });

  // Bottom separator line
  doc.rect(ML, rowY + 4, W, 1).fill('#E5E7EB');

  // Footer
  doc.fillColor(GRAY).fontSize(7).font('Helvetica')
     .text('Fadl Clinic — Confidential Medical Document', ML, 785, { align: 'center', width: W });

  const bufferPromise = collectStream(doc);
  doc.end();
  return bufferPromise;
}

export async function buildInvoicePdf(opts: InvoiceOptions): Promise<Buffer> {
  const ML  = 50;
  const doc = new PDFDocument({ size: 'A4', margin: ML, info: { Title: `Invoice ${opts.invoiceId}` } });

  const RED   = '#DC2626';
  const GRAY  = '#6B7280';
  const DARK  = '#111827';
  const LIGHT = '#F9FAFB';
  const W     = 495;

  const fmt = (n: number) =>
    `EGP ${n.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  drawHeader(doc, W, ML);

  // Invoice header info
  doc.moveDown(3.5);
  const infoY = doc.y;
  doc.fillColor(DARK).fontSize(10).font('Helvetica-Bold').text('INVOICE', ML, infoY);
  doc.fillColor(GRAY).fontSize(9).font('Helvetica')
     .text(`#${opts.invoiceId}`, ML, infoY + 16)
     .text(opts.date, ML, infoY + 30);

  doc.fillColor(DARK).fontSize(10).font('Helvetica-Bold').text('STATUS', 350, infoY, { align: 'left' });
  doc.fillColor(opts.status === 'paid' || opts.status === 'reconciled' ? '#16A34A' : GRAY)
     .fontSize(9).font('Helvetica').text(opts.status.toUpperCase(), 350, infoY + 16);

  doc.moveDown(4);

  // Billed to box
  const billY = doc.y;
  doc.rect(ML, billY, W, 60).fill(LIGHT);
  doc.fillColor(GRAY).fontSize(7).font('Helvetica-Bold')
     .text('BILLED TO', ML + 12, billY + 8);
  doc.fillColor(DARK).fontSize(11).font('Helvetica-Bold')
     .text(opts.patientName, ML + 12, billY + 20);
  doc.fillColor(GRAY).fontSize(9).font('Helvetica')
     .text(`with ${opts.doctorName}  |  Patient · Fadl Clinic`, ML + 12, billY + 36);

  doc.moveDown(5.5);

  // Line items table header
  const tblY = doc.y;
  doc.rect(ML, tblY, W, 22).fill(RED);
  doc.fillColor('white').fontSize(8).font('Helvetica-Bold')
     .text('SERVICE', ML + 12, tblY + 7)
     .text('QTY', 310, tblY + 7)
     .text('PRICE', 360, tblY + 7)
     .text('TOTAL', 430, tblY + 7);

  // Service row
  let rowY = tblY + 22;
  doc.rect(ML, rowY, W, 24).fill('#F3F4F6');
  doc.fillColor(DARK).fontSize(9).font('Helvetica')
     .text(opts.visitType, ML + 12, rowY + 7, { width: 240 })
     .text('1', 310, rowY + 7)
     .text(fmt(opts.charge), 340, rowY + 7)
     .text(fmt(opts.charge), 420, rowY + 7);
  rowY += 24;

  // Source fee row (if applicable)
  if (opts.sourceFee > 0) {
    doc.rect(ML, rowY, W, 24).fill('#FFFFFF');
    doc.fillColor(DARK).fontSize(9).font('Helvetica')
       .text('Source fee', ML + 12, rowY + 7, { width: 240 })
       .text('1', 310, rowY + 7)
       .text(fmt(opts.sourceFee), 340, rowY + 7)
       .text(fmt(opts.sourceFee), 420, rowY + 7);
    rowY += 24;
  }

  // Totals
  const totY = rowY + 16;
  doc.fillColor(GRAY).fontSize(9).font('Helvetica')
     .text('Subtotal', 350, totY)
     .text(fmt(opts.charge), 430, totY);

  const vatPct = Math.round((opts.vatRate ?? 0.14) * 100);
  doc.fillColor(GRAY).fontSize(9).font('Helvetica')
     .text(`VAT ${vatPct}%`, 350, totY + 16)
     .text('included', 430, totY + 16);

  doc.rect(350, totY + 32, 195, 1).fill('#E5E7EB');

  doc.fillColor(DARK).fontSize(11).font('Helvetica-Bold')
     .text('TOTAL', 350, totY + 40)
     .text(fmt(opts.charge), 420, totY + 40);

  // Payment method
  const payY = totY + 72;
  doc.rect(ML, payY, W, 44).fill(LIGHT);
  doc.fillColor(GRAY).fontSize(7).font('Helvetica-Bold')
     .text('PAYMENT METHOD', ML + 12, payY + 8);
  doc.fillColor(DARK).fontSize(10).font('Helvetica')
     .text(opts.paymentMethod, ML + 12, payY + 20);

  // Refund note
  if (opts.isRefund && opts.refundReason) {
    const refY = payY + 60;
    doc.rect(ML, refY, W, 40).fill('#FEF2F2');
    doc.fillColor('#DC2626').fontSize(8).font('Helvetica-Bold')
       .text('REFUNDED', ML + 12, refY + 6);
    doc.fillColor('#EF4444').fontSize(8).font('Helvetica')
       .text(opts.refundReason, ML + 12, refY + 18, { width: W - 24 });
  }

  // Footer
  doc.fillColor(GRAY).fontSize(7).font('Helvetica')
     .text('Fadl Clinic — Confidential Medical Invoice', ML, 785, { align: 'center', width: W });

  const bufferPromise = collectStream(doc);
  doc.end();
  return bufferPromise;
}
