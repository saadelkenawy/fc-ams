import PDFDocument from 'pdfkit';
import { LOGO_WHITE_BASE64 } from './pdf-assets';

const INK   = '#0F172A';
const MUTED = '#64748B';
const RULE  = '#CBD5E1';
const ZEBRA = '#F5F5F5';

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
}

export interface InvoiceOptions {
  invoiceId:     string;
  date:          string;
  patientName:   string;
  doctorName:    string;
  visitType:     string;
  charge:        number;
  sourceFee:     number;
  vatRate:       number;
  paymentMethod: string;
  status:        string;
  isRefund:      boolean;
  refundReason?: string;
}

function collectStream(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end',  () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
}

// ── Settlement / financial report PDF ────────────────────────────────────────

export async function buildPdf<T extends Record<string, unknown>>(opts: ReportOptions<T>): Promise<Buffer> {
  const ML  = 40;
  const doc = new PDFDocument({ size: 'A4', margin: ML, info: { Title: opts.title } });
  const W   = 515;

  // Full-bleed dark header band with logo
  const BAND   = 58;
  const logoW  = 148;
  const logoH  = Math.round(logoW * 396 / 1758);
  doc.rect(0, 0, 595, BAND).fill(INK);
  doc.image(Buffer.from(LOGO_WHITE_BASE64, 'base64'), ML, Math.round((BAND - logoH) / 2), { width: logoW });
  doc.fillColor('#FFFFFF').fontSize(8).font('Helvetica')
     .text(
       new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
       ML, Math.round((BAND - 8) / 2),
       { width: W, align: 'right', lineBreak: false },
     );

  let y = BAND + 14;

  // Title
  doc.fillColor(INK).fontSize(13).font('Helvetica-Bold')
     .text(opts.title, ML, y, { lineBreak: false });
  y += 20;
  doc.fillColor(MUTED).fontSize(8.5).font('Helvetica')
     .text(opts.subtitle, ML, y, { lineBreak: false });
  y += 20;

  // Doctor / report-to block
  if (opts.reportTo?.length) {
    opts.reportTo.forEach((item) => {
      doc.fillColor(MUTED).fontSize(8).font('Helvetica')
         .text(`${item.label}:`, ML, y, { width: 90, lineBreak: false });
      doc.fillColor(INK).fontSize(8).font('Helvetica-Bold')
         .text(item.value, ML + 92, y, { width: W - 92, lineBreak: false });
      y += 15;
    });
    y += 8;
  }

  // Summary — two columns, label above value
  if (opts.summary?.length) {
    doc.rect(ML, y, W, 0.5).fill(RULE);
    y += 13;

    for (let i = 0; i < opts.summary.length; i += 2) {
      const pair = opts.summary.slice(i, i + 2);
      pair.forEach((s, j) => {
        const cx = ML + j * (W / 2);
        doc.fillColor(MUTED).fontSize(7.5).font('Helvetica')
           .text(s.label, cx, y, { width: W / 2 - 10, lineBreak: false });
        doc.fillColor(INK).fontSize(10).font('Helvetica-Bold')
           .text(s.value, cx, y + 13, { width: W / 2 - 10, lineBreak: false });
      });
      y += 32;
    }
    y += 6;
    doc.rect(ML, y, W, 0.5).fill(RULE);
    y += 12;
  }

  // Table
  const colStarts: number[] = [];
  let cx = ML;
  opts.columns.forEach((col) => { colStarts.push(cx); cx += col.width; });

  // Column headers
  opts.columns.forEach((col, i) => {
    doc.fillColor(MUTED).fontSize(7).font('Helvetica-Bold')
       .text(col.header.toUpperCase(), colStarts[i], y, { width: col.width - 6, lineBreak: false });
  });
  y += 12;
  doc.rect(ML, y, W, 0.5).fill(RULE);
  y += 5;

  if (opts.rows.length === 0) {
    doc.fillColor(MUTED).fontSize(8.5).font('Helvetica')
       .text('No transactions found for the selected period.', ML, y, { width: W, lineBreak: false });
    y += 20;
  } else {
    const drawColHeaders = (): void => {
      opts.columns.forEach((col, i) => {
        doc.fillColor(MUTED).fontSize(7).font('Helvetica-Bold')
           .text(col.header.toUpperCase(), colStarts[i], y, { width: col.width - 6, lineBreak: false });
      });
      y += 12;
      doc.rect(ML, y, W, 0.5).fill(RULE);
      y += 5;
    };

    opts.rows.forEach((row, ri) => {
      const rowH = 17;
      if (ri % 2 === 0) {
        doc.rect(ML, y, W, rowH).fill(ZEBRA);
      }
      opts.columns.forEach((col, i) => {
        const raw  = row[String(col.key)];
        const text = col.format ? col.format(raw) : String(raw ?? '');
        doc.fillColor(INK).fontSize(7.5).font('Helvetica')
           .text(text, colStarts[i], y + 5, { width: col.width - 6, lineBreak: false });
      });
      y += rowH;

      if (y > 770) {
        doc.addPage();
        y = ML;
        drawColHeaders();
      }
    });
  }
  doc.rect(ML, y, W, 0.5).fill(RULE);

  // Footer
  const footerY = 800;
  doc.fillColor(MUTED).fontSize(7).font('Helvetica')
     .text('Fadl Clinic  ·  Confidential Financial Document', ML, footerY, { width: W / 2, lineBreak: false });
  doc.fillColor(MUTED).fontSize(7).font('Helvetica')
     .text(new Date().toLocaleDateString('en-GB'), ML, footerY, { width: W, align: 'right', lineBreak: false });

  const p = collectStream(doc);
  doc.end();
  return p;
}

// ── Single-transaction invoice PDF ───────────────────────────────────────────

export async function buildInvoicePdf(opts: InvoiceOptions): Promise<Buffer> {
  const ML  = 40;
  const doc = new PDFDocument({ size: 'A4', margin: ML, info: { Title: `Invoice ${opts.invoiceId}` } });
  const W   = 515;

  const fmt = (n: number) =>
    `EGP ${n.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // Full-bleed dark header band with logo
  const BAND   = 58;
  const logoW  = 148;
  const logoH  = Math.round(logoW * 396 / 1758);
  doc.rect(0, 0, 595, BAND).fill(INK);
  doc.image(Buffer.from(LOGO_WHITE_BASE64, 'base64'), ML, Math.round((BAND - logoH) / 2), { width: logoW });
  doc.fillColor('#FFFFFF').fontSize(8).font('Helvetica')
     .text(
       new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
       ML, Math.round((BAND - 8) / 2),
       { width: W, align: 'right', lineBreak: false },
     );

  let y = BAND + 15;

  // Invoice number + status
  doc.fillColor(INK).fontSize(10).font('Helvetica-Bold')
     .text(`Invoice #${opts.invoiceId}`, ML, y, { lineBreak: false });
  const statusColor = (opts.status === 'paid' || opts.status === 'reconciled') ? '#16A34A' : MUTED;
  doc.fillColor(statusColor).fontSize(9).font('Helvetica-Bold')
     .text(opts.status.toUpperCase(), ML, y, { width: W, align: 'right', lineBreak: false });
  y += 15;
  doc.fillColor(MUTED).fontSize(8).font('Helvetica')
     .text(opts.date, ML, y, { lineBreak: false });
  y += 24;

  // Patient / doctor
  [
    { label: 'Patient', value: opts.patientName },
    { label: 'Doctor',  value: opts.doctorName  },
  ].forEach((item) => {
    doc.fillColor(MUTED).fontSize(8).font('Helvetica')
       .text(`${item.label}:`, ML, y, { width: 60, lineBreak: false });
    doc.fillColor(INK).fontSize(8).font('Helvetica-Bold')
       .text(item.value, ML + 62, y, { width: W - 62, lineBreak: false });
    y += 15;
  });
  y += 10;
  doc.rect(ML, y, W, 0.5).fill(RULE);
  y += 13;

  // Line items table
  const COLS = [
    { label: 'Service',    x: ML,       w: 240 },
    { label: 'Qty',        x: ML + 250, w: 60  },
    { label: 'Unit Price', x: ML + 315, w: 100 },
    { label: 'Total',      x: ML + 420, w: 95  },
  ];
  COLS.forEach((c) => {
    doc.fillColor(MUTED).fontSize(7).font('Helvetica-Bold')
       .text(c.label.toUpperCase(), c.x, y, { width: c.w, lineBreak: false });
  });
  y += 12;
  doc.rect(ML, y, W, 0.5).fill(RULE);
  y += 5;

  // Service row
  doc.rect(ML, y, W, 17).fill(ZEBRA);
  doc.fillColor(INK).fontSize(8.5).font('Helvetica')
     .text(opts.visitType,  COLS[0].x, y + 4, { width: COLS[0].w, lineBreak: false })
     .text('1',             COLS[1].x, y + 4, { width: COLS[1].w, lineBreak: false })
     .text(fmt(opts.charge), COLS[2].x, y + 4, { width: COLS[2].w, lineBreak: false })
     .text(fmt(opts.charge), COLS[3].x, y + 4, { width: COLS[3].w, lineBreak: false });
  y += 17;

  if (opts.sourceFee > 0) {
    doc.fillColor(INK).fontSize(8.5).font('Helvetica')
       .text('Source fee',         COLS[0].x, y + 4, { width: COLS[0].w, lineBreak: false })
       .text('1',                  COLS[1].x, y + 4, { width: COLS[1].w, lineBreak: false })
       .text(fmt(opts.sourceFee),  COLS[2].x, y + 4, { width: COLS[2].w, lineBreak: false })
       .text(fmt(opts.sourceFee),  COLS[3].x, y + 4, { width: COLS[3].w, lineBreak: false });
    y += 17;
  }
  doc.rect(ML, y, W, 0.5).fill(RULE);
  y += 14;

  // Totals
  const vatPct = Math.round((opts.vatRate ?? 0.14) * 100);
  [
    { label: 'Subtotal',       value: fmt(opts.charge), bold: false },
    { label: `VAT ${vatPct}%`, value: 'included',       bold: false },
    { label: 'TOTAL',          value: fmt(opts.charge), bold: true  },
  ].forEach((t) => {
    const font = t.bold ? 'Helvetica-Bold' : 'Helvetica';
    doc.fillColor(MUTED).fontSize(8.5).font(font)
       .text(t.label, ML + 320, y, { width: 85, lineBreak: false });
    doc.fillColor(INK).fontSize(8.5).font(font)
       .text(t.value, ML + 410, y, { width: 105, lineBreak: false });
    y += 15;
  });
  y += 12;

  // Payment method
  doc.fillColor(MUTED).fontSize(8).font('Helvetica')
     .text('Payment Method:', ML, y, { width: 105, lineBreak: false });
  doc.fillColor(INK).fontSize(8).font('Helvetica-Bold')
     .text(opts.paymentMethod, ML + 107, y, { width: W - 107, lineBreak: false });
  y += 22;

  // Refund notice
  if (opts.isRefund && opts.refundReason) {
    doc.fillColor('#DC2626').fontSize(7.5).font('Helvetica-Bold')
       .text('REFUNDED', ML, y, { lineBreak: false });
    y += 13;
    doc.fillColor('#EF4444').fontSize(8).font('Helvetica')
       .text(opts.refundReason, ML, y, { width: W, lineBreak: false });
    y += 20;
  }

  // Footer
  const footerY = 800;
  doc.fillColor(MUTED).fontSize(7).font('Helvetica')
     .text('Fadl Clinic  ·  Confidential Medical Invoice', ML, footerY, { width: W / 2, lineBreak: false });
  doc.fillColor(MUTED).fontSize(7).font('Helvetica')
     .text(new Date().toLocaleDateString('en-GB'), ML, footerY, { width: W, align: 'right', lineBreak: false });

  const p = collectStream(doc);
  doc.end();
  return p;
}
