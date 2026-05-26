import PDFDocument from 'pdfkit';
import { LOGO_BASE64 } from './pdf-assets';

// ── Design tokens ────────────────────────────────────────────────────────────
// Header/structure: deep navy instead of high-saturation red
const NAVY    = '#1E293B';  // slate-800  — header bg, table header
const TEAL    = '#0D9488';  // teal-600   — primary accent, left borders
const MUTED   = '#64748B';  // slate-500  — meta labels, secondary text
const BORDER  = '#E2E8F0';  // slate-200  — card borders, dividers
const SURFACE = '#F8FAFC';  // slate-50   — card/box backgrounds
const ZEBRA   = '#F1F5F9';  // slate-100  — table alternating row fill
const INK     = '#0F172A';  // slate-950  — primary body text
const WHITE   = '#FFFFFF';

// Per-KPI card accent colors: Total Gross / Doctor Share / Source Fees / Net Payable
const KPI_ACCENTS: string[] = ['#0D9488', '#4F46E5', '#D97706', '#16A34A'];

// ── Interfaces ───────────────────────────────────────────────────────────────

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

// ── Helpers ──────────────────────────────────────────────────────────────────

function collectStream(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end',  () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
}

// Strokes a rectangle border without filling it
function outline(
  doc: PDFKit.PDFDocument,
  x: number, y: number, w: number, h: number,
  color = BORDER, lw = 0.5,
) {
  doc.save().lineWidth(lw).rect(x, y, w, h).stroke(color).restore();
}

// Shared page header — dark navy with logo, contact block, teal accent bar
// Returns the Y coordinate immediately below the header
function drawPageHeader(doc: PDFKit.PDFDocument, W: number, ML: number): number {
  const H = 64;
  doc.rect(ML, ML, W, H).fill(NAVY);

  try {
    doc.image(Buffer.from(LOGO_BASE64, 'base64'), ML + 14, ML + 16, { width: 116, height: 32 });
  } catch {
    doc.fillColor(WHITE).fontSize(15).font('Helvetica-Bold')
       .text('FADL CLINIC', ML + 14, ML + 24, { lineBreak: false });
  }

  // Contact block — slate-400 so it reads as metadata, not content
  doc.fillColor('#94A3B8').fontSize(7.5).font('Helvetica')
     .text('12 El-Tahrir St., Cairo, Egypt', ML, ML + 15, { width: W - 14, align: 'right', lineBreak: false });
  doc.fillColor('#94A3B8').fontSize(7.5).font('Helvetica')
     .text('+20 2 2345 6789  ·  info@fadlclinic.com', ML, ML + 27, { width: W - 14, align: 'right', lineBreak: false });
  doc.fillColor('#94A3B8').fontSize(7.5).font('Helvetica')
     .text('fadlclinic.com', ML, ML + 39, { width: W - 14, align: 'right', lineBreak: false });

  // Teal accent underline — primary brand cue without the red fatigue
  doc.rect(ML, ML + H - 3, W, 3).fill(TEAL);

  return ML + H;
}

// ── Settlement / financial report PDF ───────────────────────────────────────

export async function buildPdf<T extends Record<string, unknown>>(opts: ReportOptions<T>): Promise<Buffer> {
  const ML  = 40;
  const doc = new PDFDocument({ size: 'A4', margin: ML, info: { Title: opts.title } });
  const W   = 515;

  let y = drawPageHeader(doc, W, ML) + 18;

  // ── Document type badge ──────────────────────────────────────────────────
  doc.roundedRect(ML, y, 142, 17, 3).fill(SURFACE);
  outline(doc, ML, y, 142, 17, TEAL, 0.75);
  doc.fillColor(TEAL).fontSize(7).font('Helvetica-Bold')
     .text('SETTLEMENT REPORT', ML + 9, y + 5, { width: 126, lineBreak: false });
  y += 24;

  // ── Report title & meta ──────────────────────────────────────────────────
  doc.fillColor(INK).fontSize(13).font('Helvetica-Bold')
     .text(opts.title, ML, y, { width: W, lineBreak: false });
  y += 19;
  doc.fillColor(MUTED).fontSize(8).font('Helvetica')
     .text(opts.subtitle, ML, y, { width: W, lineBreak: false });
  y += 13;
  doc.fillColor(MUTED).fontSize(7.5).font('Helvetica')
     .text(
       `Generated: ${new Date().toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`,
       ML, y, { width: W, lineBreak: false },
     );
  y += 18;

  // Horizontal rule
  doc.rect(ML, y, W, 0.5).fill(BORDER);
  y += 14;

  // ── "Settled To" info card ───────────────────────────────────────────────
  if (opts.reportTo?.length) {
    const cardH = 16 + opts.reportTo.length * 16 + 10;
    doc.rect(ML, y, W, cardH).fill(SURFACE);
    outline(doc, ML, y, W, cardH, BORDER, 0.5);
    doc.rect(ML, y, 3.5, cardH).fill(TEAL);

    doc.fillColor(TEAL).fontSize(6.5).font('Helvetica-Bold')
       .text('SETTLED TO', ML + 11, y + 8, { lineBreak: false });

    opts.reportTo.forEach((item, idx) => {
      const ry = y + 20 + idx * 16;
      doc.fillColor(MUTED).fontSize(7.5).font('Helvetica')
         .text(`${item.label}:`, ML + 11, ry, { width: 74, lineBreak: false });
      doc.fillColor(INK).fontSize(7.5).font('Helvetica-Bold')
         .text(item.value, ML + 86, ry, { width: W - 100, lineBreak: false });
    });
    y += cardH + 14;
  }

  // ── KPI summary cards ────────────────────────────────────────────────────
  if (opts.summary?.length) {
    const n      = opts.summary.length;
    const gap    = 8;
    const cardW  = (W - (n - 1) * gap) / n;
    const cardH  = 52;

    opts.summary.forEach((s, i) => {
      const cx     = ML + i * (cardW + gap);
      const accent = KPI_ACCENTS[i % KPI_ACCENTS.length];

      doc.rect(cx, y, cardW, cardH).fill(WHITE);
      outline(doc, cx, y, cardW, cardH, BORDER, 0.5);
      doc.rect(cx, y, 3.5, cardH).fill(accent);

      // Micro-label
      doc.fillColor(MUTED).fontSize(6).font('Helvetica-Bold')
         .text(s.label.toUpperCase(), cx + 10, y + 8, { width: cardW - 14, lineBreak: false });

      // Value — sized to fit EGP amounts within card width
      doc.fillColor(INK).fontSize(11.5).font('Helvetica-Bold')
         .text(s.value, cx + 10, y + 20, { width: cardW - 14, lineBreak: false });
    });
    y += cardH + 14;
  }

  // ── Data table ───────────────────────────────────────────────────────────
  const colStarts: number[] = [];
  let cx = ML;
  opts.columns.forEach((col) => { colStarts.push(cx); cx += col.width; });

  // Table header row — navy instead of high-saturation red
  doc.rect(ML, y, W, 22).fill(NAVY);
  opts.columns.forEach((col, i) => {
    doc.fillColor(WHITE).fontSize(7).font('Helvetica-Bold')
       .text(col.header.toUpperCase(), colStarts[i] + 5, y + 7, { width: col.width - 10, lineBreak: false });
  });
  y += 22;

  if (opts.rows.length === 0) {
    // Empty state — centered illustration + copy
    const emptyH = 78;
    doc.rect(ML, y, W, emptyH).fill(SURFACE);
    outline(doc, ML, y, W, emptyH, BORDER, 0.5);
    doc.fillColor(BORDER).fontSize(18).font('Helvetica-Bold')
       .text('— — —', ML, y + 10, { width: W, align: 'center', lineBreak: false });
    doc.fillColor(MUTED).fontSize(10).font('Helvetica-Bold')
       .text('No Transactions Found', ML, y + 33, { width: W, align: 'center', lineBreak: false });
    doc.fillColor(MUTED).fontSize(8).font('Helvetica')
       .text('No settled or paid transactions exist for the selected period.', ML, y + 48, { width: W, align: 'center', lineBreak: false });
    y += emptyH;
  } else {
    opts.rows.forEach((row, ri) => {
      const rowH = 19;
      doc.rect(ML, y, W, rowH).fill(ri % 2 === 0 ? ZEBRA : WHITE);
      doc.rect(ML, y + rowH - 0.5, W, 0.5).fill(BORDER);

      opts.columns.forEach((col, i) => {
        const raw  = row[String(col.key)];
        const text = col.format ? col.format(raw) : String(raw ?? '');
        doc.fillColor(INK).fontSize(7.5).font('Helvetica')
           .text(text, colStarts[i] + 5, y + 5, { width: col.width - 10, lineBreak: false });
      });
      y += rowH;

      if (y > 760) {
        doc.addPage();
        y = drawPageHeader(doc, W, ML) + 14;
      }
    });
    // Closing border bar
    doc.rect(ML, y, W, 1.5).fill(NAVY);
    y += 1.5;
  }

  // ── Footer ───────────────────────────────────────────────────────────────
  const footerY = 789;
  doc.rect(ML, footerY, W, 0.5).fill(BORDER);
  doc.fillColor(MUTED).fontSize(7).font('Helvetica')
     .text('Fadl Clinic  ·  Confidential Financial Document', ML, footerY + 5, { width: W / 2, lineBreak: false });
  doc.fillColor(MUTED).fontSize(7).font('Helvetica')
     .text(new Date().toLocaleDateString('en-GB'), ML, footerY + 5, { width: W, align: 'right', lineBreak: false });

  const p = collectStream(doc);
  doc.end();
  return p;
}

// ── Single-transaction invoice PDF ──────────────────────────────────────────

export async function buildInvoicePdf(opts: InvoiceOptions): Promise<Buffer> {
  const ML  = 40;
  const doc = new PDFDocument({ size: 'A4', margin: ML, info: { Title: `Invoice ${opts.invoiceId}` } });
  const W   = 515;

  const fmt = (n: number) =>
    `EGP ${n.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  let y = drawPageHeader(doc, W, ML) + 20;

  // ── Document type badge ──────────────────────────────────────────────────
  doc.roundedRect(ML, y, 80, 17, 3).fill(SURFACE);
  outline(doc, ML, y, 80, 17, TEAL, 0.75);
  doc.fillColor(TEAL).fontSize(7).font('Helvetica-Bold')
     .text('INVOICE', ML + 9, y + 5, { width: 65, lineBreak: false });
  y += 28;

  // Invoice number + date (left) / status (right)
  doc.fillColor(INK).fontSize(10).font('Helvetica-Bold')
     .text(`#${opts.invoiceId}`, ML, y, { lineBreak: false });

  const statusColor = opts.status === 'paid' || opts.status === 'reconciled' ? '#16A34A' : MUTED;
  doc.fillColor(statusColor).fontSize(9).font('Helvetica-Bold')
     .text(opts.status.toUpperCase(), ML, y, { width: W, align: 'right', lineBreak: false });

  y += 16;
  doc.fillColor(MUTED).fontSize(8).font('Helvetica')
     .text(opts.date, ML, y, { lineBreak: false });
  y += 28;

  // ── Billed to card ───────────────────────────────────────────────────────
  const billH = 56;
  doc.rect(ML, y, W, billH).fill(SURFACE);
  outline(doc, ML, y, W, billH, BORDER, 0.5);
  doc.rect(ML, y, 3.5, billH).fill(TEAL);
  doc.fillColor(TEAL).fontSize(6.5).font('Helvetica-Bold')
     .text('BILLED TO', ML + 11, y + 8, { lineBreak: false });
  doc.fillColor(INK).fontSize(11).font('Helvetica-Bold')
     .text(opts.patientName, ML + 11, y + 20, { lineBreak: false });
  doc.fillColor(MUTED).fontSize(8).font('Helvetica')
     .text(`with ${opts.doctorName}  ·  Fadl Clinic`, ML + 11, y + 36, { lineBreak: false });
  y += billH + 18;

  // ── Line items table ─────────────────────────────────────────────────────
  doc.rect(ML, y, W, 22).fill(NAVY);
  doc.fillColor(WHITE).fontSize(7).font('Helvetica-Bold')
     .text('SERVICE', ML + 11, y + 7)
     .text('QTY',   ML + 306, y + 7)
     .text('PRICE', ML + 358, y + 7)
     .text('TOTAL', ML + 430, y + 7);
  y += 22;

  // Service row
  doc.rect(ML, y, W, 22).fill(ZEBRA);
  doc.fillColor(INK).fontSize(8.5).font('Helvetica')
     .text(opts.visitType, ML + 11, y + 7, { width: 240, lineBreak: false })
     .text('1',              ML + 306, y + 7)
     .text(fmt(opts.charge), ML + 340, y + 7)
     .text(fmt(opts.charge), ML + 415, y + 7);
  y += 22;

  if (opts.sourceFee > 0) {
    doc.rect(ML, y, W, 22).fill(WHITE);
    doc.fillColor(INK).fontSize(8.5).font('Helvetica')
       .text('Source fee',       ML + 11,  y + 7, { width: 240, lineBreak: false })
       .text('1',                ML + 306, y + 7)
       .text(fmt(opts.sourceFee), ML + 340, y + 7)
       .text(fmt(opts.sourceFee), ML + 415, y + 7);
    y += 22;
  }

  doc.rect(ML, y, W, 1.5).fill(NAVY);
  y += 16;

  // ── Totals block ─────────────────────────────────────────────────────────
  const vatPct = Math.round((opts.vatRate ?? 0.14) * 100);
  doc.fillColor(MUTED).fontSize(8.5).font('Helvetica')
     .text('Subtotal',       ML + 320, y).text(fmt(opts.charge),   ML + 415, y);
  y += 15;
  doc.fillColor(MUTED).fontSize(8.5).font('Helvetica')
     .text(`VAT ${vatPct}%`, ML + 320, y).text('included', ML + 415, y);
  y += 15;
  doc.rect(ML + 318, y, W - 318, 0.5).fill(BORDER);
  y += 10;
  doc.fillColor(INK).fontSize(11).font('Helvetica-Bold')
     .text('TOTAL', ML + 320, y).text(fmt(opts.charge), ML + 408, y);
  y += 28;

  // ── Payment method card ───────────────────────────────────────────────────
  const payH = 42;
  doc.rect(ML, y, W, payH).fill(SURFACE);
  outline(doc, ML, y, W, payH, BORDER, 0.5);
  doc.rect(ML, y, 3.5, payH).fill(TEAL);
  doc.fillColor(TEAL).fontSize(6.5).font('Helvetica-Bold')
     .text('PAYMENT METHOD', ML + 11, y + 8, { lineBreak: false });
  doc.fillColor(INK).fontSize(10).font('Helvetica')
     .text(opts.paymentMethod, ML + 11, y + 22, { lineBreak: false });
  y += payH + 14;

  // ── Refund notice ─────────────────────────────────────────────────────────
  if (opts.isRefund && opts.refundReason) {
    doc.rect(ML, y, W, 38).fill('#FEF2F2');
    outline(doc, ML, y, W, 38, '#FECACA', 0.5);
    doc.fillColor('#DC2626').fontSize(7.5).font('Helvetica-Bold')
       .text('REFUNDED', ML + 11, y + 7, { lineBreak: false });
    doc.fillColor('#EF4444').fontSize(8).font('Helvetica')
       .text(opts.refundReason, ML + 11, y + 20, { width: W - 24, lineBreak: false });
    y += 52;
  }

  // ── Footer ────────────────────────────────────────────────────────────────
  const footerY = 789;
  doc.rect(ML, footerY, W, 0.5).fill(BORDER);
  doc.fillColor(MUTED).fontSize(7).font('Helvetica')
     .text('Fadl Clinic  ·  Confidential Medical Invoice', ML, footerY + 5, { width: W / 2, lineBreak: false });
  doc.fillColor(MUTED).fontSize(7).font('Helvetica')
     .text(new Date().toLocaleDateString('en-GB'), ML, footerY + 5, { width: W, align: 'right', lineBreak: false });

  const p = collectStream(doc);
  doc.end();
  return p;
}
