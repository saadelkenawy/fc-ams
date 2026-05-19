import PDFDocument from 'pdfkit';

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

export async function buildPdf<T extends Record<string, unknown>>(opts: ReportOptions<T>): Promise<Buffer> {
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

  const bufferPromise = collectStream(doc);
  doc.end();
  return bufferPromise;
}

export async function buildInvoicePdf(opts: InvoiceOptions): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: 50, info: { Title: `Invoice ${opts.invoiceId}` } });

  const RED   = '#DC2626';
  const GRAY  = '#6B7280';
  const DARK  = '#111827';
  const LIGHT = '#F9FAFB';
  const W     = 495;

  const fmt = (n: number) =>
    `EGP ${n.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // Header bar
  doc.rect(50, 50, W, 56).fill(RED);
  doc.fillColor('white').fontSize(18).font('Helvetica-Bold')
     .text('FADL CLINIC', 66, 60);
  doc.fillColor('white').fontSize(9).font('Helvetica')
     .text('فضل كلينك  |  12 El-Tahrir St., Cairo  |  +20 2 2345 6789', 66, 82);

  // Invoice header info
  doc.moveDown(2.5);
  const infoY = doc.y;
  doc.fillColor(DARK).fontSize(10).font('Helvetica-Bold').text('INVOICE', 50, infoY);
  doc.fillColor(GRAY).fontSize(9).font('Helvetica')
     .text(`#${opts.invoiceId}`, 50, infoY + 16)
     .text(opts.date, 50, infoY + 30);

  doc.fillColor(DARK).fontSize(10).font('Helvetica-Bold').text('STATUS', 350, infoY, { align: 'left' });
  doc.fillColor(opts.status === 'paid' || opts.status === 'reconciled' ? '#16A34A' : GRAY)
     .fontSize(9).font('Helvetica').text(opts.status.toUpperCase(), 350, infoY + 16);

  doc.moveDown(4);

  // Billed to box
  const billY = doc.y;
  doc.rect(50, billY, W, 60).fill(LIGHT);
  doc.fillColor(GRAY).fontSize(7).font('Helvetica-Bold')
     .text('BILLED TO', 62, billY + 8);
  doc.fillColor(DARK).fontSize(11).font('Helvetica-Bold')
     .text(opts.patientName, 62, billY + 20);
  doc.fillColor(GRAY).fontSize(9).font('Helvetica')
     .text(`with ${opts.doctorName}  |  Patient · Fadl Clinic`, 62, billY + 36);

  doc.moveDown(5.5);

  // Line items table header
  const tblY = doc.y;
  doc.rect(50, tblY, W, 22).fill(RED);
  doc.fillColor('white').fontSize(8).font('Helvetica-Bold')
     .text('SERVICE', 62, tblY + 7)
     .text('QTY', 310, tblY + 7)
     .text('PRICE', 360, tblY + 7)
     .text('TOTAL', 430, tblY + 7);

  // Service row
  let rowY = tblY + 22;
  doc.rect(50, rowY, W, 24).fill('#F3F4F6');
  doc.fillColor(DARK).fontSize(9).font('Helvetica')
     .text(opts.visitType, 62, rowY + 7, { width: 240 })
     .text('1', 310, rowY + 7)
     .text(fmt(opts.charge), 340, rowY + 7)
     .text(fmt(opts.charge), 420, rowY + 7);
  rowY += 24;

  // Source fee row (if applicable)
  if (opts.sourceFee > 0) {
    doc.rect(50, rowY, W, 24).fill('#FFFFFF');
    doc.fillColor(DARK).fontSize(9).font('Helvetica')
       .text(`Source fee`, 62, rowY + 7, { width: 240 })
       .text('1', 310, rowY + 7)
       .text(fmt(opts.sourceFee), 340, rowY + 7)
       .text(fmt(opts.sourceFee), 420, rowY + 7);
    rowY += 24;
  }

  // Totals
  doc.moveDown(1);
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
  doc.rect(50, payY, W, 44).fill(LIGHT);
  doc.fillColor(GRAY).fontSize(7).font('Helvetica-Bold')
     .text('PAYMENT METHOD', 62, payY + 8);
  doc.fillColor(DARK).fontSize(10).font('Helvetica')
     .text(opts.paymentMethod, 62, payY + 20);

  // Refund note
  if (opts.isRefund && opts.refundReason) {
    const refY = payY + 60;
    doc.rect(50, refY, W, 40).fill('#FEF2F2');
    doc.fillColor('#DC2626').fontSize(8).font('Helvetica-Bold')
       .text('REFUNDED', 62, refY + 6);
    doc.fillColor('#EF4444').fontSize(8).font('Helvetica')
       .text(opts.refundReason, 62, refY + 18, { width: W - 24 });
  }

  // Footer
  doc.fillColor(GRAY).fontSize(7).font('Helvetica')
     .text('Fadl Clinic — Confidential Medical Invoice', 50, 780, { align: 'center', width: W });

  const bufferPromise = collectStream(doc);
  doc.end();
  return bufferPromise;
}
