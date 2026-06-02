'use client';

import type { Prescription, Patient, Doctor } from '@fadl/types';

/* ── label maps ──────────────────────────────────────────────────────────── */

const FORM: Record<string, { en: string; ar: string }> = {
  cap: { en: 'Capsule',   ar: 'كبسولة' },
  tab: { en: 'Tablet',    ar: 'قرص'    },
  syr: { en: 'Syrup',     ar: 'شراب'   },
  inj: { en: 'Injection', ar: 'حقنة'   },
  gtt: { en: 'Drops',     ar: 'نقطة'   },
};

const FREQ: Record<string, { en: string; ar: string }> = {
  od:  { en: 'Once daily',           ar: 'مرة يومياً'         },
  bid: { en: 'Twice daily',          ar: 'مرتين يومياً'       },
  tid: { en: 'Three times daily',    ar: 'ثلاث مرات يومياً'   },
  qid: { en: 'Four times daily',     ar: 'أربع مرات يومياً'   },
  q4h: { en: 'Every 4 hours',        ar: 'كل 4 ساعات'         },
};

const TIMING: Record<string, { en: string; ar: string }> = {
  ac:   { en: 'Before meals',  ar: 'قبل الأكل'  },
  pc:   { en: 'After meals',   ar: 'بعد الأكل'  },
  hs:   { en: 'At bedtime',    ar: 'عند النوم'  },
  stat: { en: 'Immediately',   ar: 'فوراً'      },
  prn:  { en: 'As needed',     ar: 'عند الحاجة' },
  none: { en: '',              ar: ''            },
};

/* ── helpers ─────────────────────────────────────────────────────────────── */

function calcAge(dob?: string): number | null {
  if (!dob) return null;
  return Math.floor((Date.now() - new Date(dob).getTime()) / (1000 * 60 * 60 * 24 * 365.25));
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });
}

/* ── component ───────────────────────────────────────────────────────────── */

export interface PrescriptionPrintTemplateProps {
  rx:          Prescription;
  patient?:    Patient | null;
  doctor?:     Doctor | null;
  patientName?: string;
  doctorName?:  string;
}

export function PrescriptionPrintTemplate({
  rx, patient, doctor, patientName, doctorName,
}: PrescriptionPrintTemplateProps) {
  const displayPatient = patientName ?? patient?.nameEn ?? rx.patientId;
  const displayDoctor  = doctorName  ?? doctor?.nameEn  ?? rx.doctorId;
  const age            = calcAge(patient?.dateOfBirth);
  const patientAr      = patient?.nameAr;

  /* ── inline style objects for print fidelity ── */
  const page: React.CSSProperties = {
    fontFamily:  "'Outfit', 'IBM Plex Sans', 'Tajawal', Arial, sans-serif",
    fontSize:    '10.5pt',
    color:       '#111',
    background:  '#fff',
    width:       '210mm',
    minHeight:   '297mm',
    padding:     '12mm 18mm 16mm',
    boxSizing:   'border-box',
    margin:      '0 auto',
    position:    'relative',
  };

  const pill = (bg: string, color: string): React.CSSProperties => ({
    display: 'inline-block', padding: '1mm 3mm', borderRadius: '999px',
    fontSize: '8pt', fontWeight: 600, background: bg, color,
  });

  return (
    <div style={page}>

      {/* ── HEADER ── */}
      <header style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        borderBottom: '2.5px solid #1d4ed8', paddingBottom: '6mm', marginBottom: '5mm',
      }}>
        {/* logo + clinic name */}
        <div style={{ display: 'flex', gap: '4mm', alignItems: 'center' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/logo-dark-transparent.png"
            alt="Fadl Clinic"
            style={{ width: '52px', height: '52px', objectFit: 'contain' }}
          />
          <div>
            <div style={{ fontWeight: 800, fontSize: '15pt', color: '#1d4ed8', lineHeight: 1.1 }}>
              Fadl Clinic
            </div>
            <div style={{ fontWeight: 700, fontSize: '11pt', color: '#3b82f6', lineHeight: 1.1, direction: 'rtl' }}>
              عيادة فضل
            </div>
          </div>
        </div>

        {/* date + ID */}
        <div style={{ textAlign: 'right', fontSize: '9pt', color: '#555', lineHeight: 1.6 }}>
          <div><strong>Date / التاريخ:</strong> {fmtDate(rx.createdAt)}</div>
          <div style={{ fontFamily: 'monospace', fontSize: '8pt', color: '#94a3b8', marginTop: '1mm' }}>
            Rx# {rx.id.slice(0, 8).toUpperCase()}
          </div>
        </div>
      </header>

      {/* ── DOCTOR + PATIENT ROW ── */}
      <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4mm', marginBottom: '5mm' }}>
        {/* doctor card */}
        <div style={{
          padding: '3mm 4mm', background: '#eff6ff',
          borderRadius: '2mm', borderLeft: '3px solid #1d4ed8',
        }}>
          <div style={{ fontSize: '7.5pt', color: '#3b82f6', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '1.5mm' }}>
            Prescribing Doctor
          </div>
          <div style={{ fontWeight: 700, fontSize: '12pt' }}>Dr. {displayDoctor}</div>
          {doctor?.nameAr && doctor.nameAr !== displayDoctor && (
            <div style={{ fontSize: '9.5pt', color: '#3b82f6', direction: 'rtl', marginTop: '0.5mm' }}>
              د. {doctor.nameAr}
            </div>
          )}
          {doctor?.subSpecialty && (
            <div style={{ fontSize: '8.5pt', color: '#555', marginTop: '1mm' }}>{doctor.subSpecialty}</div>
          )}
          <div style={{ fontSize: '8pt', color: '#94a3b8', marginTop: '1mm' }}>
            {doctor?.mobile}
          </div>
        </div>

        {/* patient card */}
        <div style={{
          padding: '3mm 4mm', background: '#f0fdf4',
          borderRadius: '2mm', borderLeft: '3px solid #16a34a',
        }}>
          <div style={{ fontSize: '7.5pt', color: '#16a34a', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '1.5mm' }}>
            Patient / المريض
          </div>
          <div style={{ fontWeight: 700, fontSize: '12pt' }}>{displayPatient}</div>
          {patientAr && (
            <div style={{ fontSize: '9.5pt', color: '#15803d', direction: 'rtl', marginTop: '0.5mm' }}>
              {patientAr}
            </div>
          )}
          <div style={{ fontSize: '8.5pt', color: '#555', marginTop: '1.5mm', display: 'flex', flexWrap: 'wrap', gap: '3mm' }}>
            {age !== null && <span>Age: <strong>{age} yrs</strong></span>}
            {patient?.gender && (
              <span>Gender: <strong>{patient.gender === 'M' ? 'Male' : 'Female'}</strong></span>
            )}
            {patient?.nationalId && <span>ID: <strong>{patient.nationalId}</strong></span>}
            {patient?.bloodType && (
              <span style={pill('#fee2e2', '#b91c1c')}>{patient.bloodType}</span>
            )}
          </div>
        </div>
      </section>

      {/* ── DIAGNOSIS ── */}
      {rx.diagnosis && (
        <section style={{
          marginBottom: '4mm', padding: '2.5mm 4mm',
          background: '#fefce8', borderRadius: '2mm', borderLeft: '3px solid #ca8a04',
        }}>
          <span style={{ fontSize: '7.5pt', color: '#854d0e', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
            Diagnosis / التشخيص:{' '}
          </span>
          <span style={{ fontSize: '10.5pt' }}>{rx.diagnosis}</span>
        </section>
      )}

      {/* ── Rx SYMBOL + ITEMS TABLE ── */}
      <section style={{ marginBottom: '6mm' }}>
        <div style={{ fontFamily: 'serif', fontSize: '22pt', fontWeight: 900, color: '#1d4ed8', lineHeight: 1, marginBottom: '3mm' }}>
          ℞
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10pt' }}>
          <thead>
            <tr style={{ background: '#eff6ff' }}>
              {['#', 'Medication / Dose', 'Frequency / التكرار', 'Duration', 'Qty'].map((h, i) => (
                <th key={h} style={{
                  padding: '2mm 3mm', fontWeight: 700, fontSize: '8pt',
                  textAlign: i === 4 ? 'right' : 'left',
                  borderBottom: '2px solid #93c5fd',
                  width: i === 0 ? '5mm' : i === 4 ? '12mm' : i === 3 ? '18mm' : 'auto',
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rx.items.map((it, idx) => (
              <tr key={it.id} style={{ borderBottom: '0.5px solid #e2e8f0', verticalAlign: 'top' }}>
                {/* # */}
                <td style={{ padding: '3mm 3mm 3mm', color: '#94a3b8', fontWeight: 600 }}>
                  {idx + 1}
                </td>

                {/* name + form + dose */}
                <td style={{ padding: '3mm' }}>
                  <div style={{ fontWeight: 700, fontSize: '10.5pt' }}>{it.medicationName}</div>
                  <div style={{ fontSize: '8.5pt', color: '#555', marginTop: '0.5mm' }}>
                    {FORM[it.form]?.en ?? it.form}
                    {it.dosageValue && (
                      <> &middot; {it.dosageValue}{it.dosageUnit ?? ''}</>
                    )}
                  </div>
                  {/* bilingual form */}
                  {FORM[it.form]?.ar && (
                    <div style={{ fontSize: '8pt', color: '#94a3b8', direction: 'rtl', marginTop: '0.5mm' }}>
                      {FORM[it.form].ar}
                      {it.dosageValue && <> &middot; {it.dosageValue}{it.dosageUnit ?? ''}</>}
                    </div>
                  )}
                  {it.routeInstruction && (
                    <div style={{ fontSize: '8pt', color: '#64748b', fontStyle: 'italic', marginTop: '1mm' }}>
                      {it.routeInstruction}
                    </div>
                  )}
                </td>

                {/* frequency + timing */}
                <td style={{ padding: '3mm' }}>
                  <div style={{ fontWeight: 500 }}>{FREQ[it.frequency]?.en ?? it.frequency}</div>
                  {it.timing && it.timing !== 'none' && (
                    <div style={{ fontSize: '8.5pt', color: '#555', marginTop: '0.5mm' }}>
                      {TIMING[it.timing]?.en}
                    </div>
                  )}
                  {/* Arabic line */}
                  <div style={{ fontSize: '8pt', color: '#94a3b8', direction: 'rtl', marginTop: '0.5mm' }}>
                    {FREQ[it.frequency]?.ar}
                    {it.timing && it.timing !== 'none' && <> &middot; {TIMING[it.timing]?.ar}</>}
                  </div>
                </td>

                {/* duration */}
                <td style={{ padding: '3mm', whiteSpace: 'nowrap' }}>
                  {it.durationDays ? `${it.durationDays} days` : '—'}
                </td>

                {/* qty */}
                <td style={{ padding: '3mm', textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 600 }}>
                  {it.dispenseQuantity ?? '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* ── NOTES ── */}
      {rx.notes && (
        <section style={{
          marginBottom: '8mm', padding: '2.5mm 4mm',
          border: '1px dashed #cbd5e1', borderRadius: '2mm',
        }}>
          <div style={{ fontSize: '7.5pt', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '1mm' }}>
            Notes / ملاحظات
          </div>
          <div style={{ fontSize: '10.5pt' }}>{rx.notes}</div>
        </section>
      )}

      {/* ── SIGNATURE ROW ── */}
      <section style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
        paddingTop: '14mm', marginTop: 'auto',
      }}>
        {/* doctor signature */}
        <div style={{ textAlign: 'center', minWidth: '60mm' }}>
          <div style={{ borderTop: '1.5px solid #111', paddingTop: '2mm', fontSize: '9pt' }}>
            <div style={{ fontWeight: 700 }}>Dr. {displayDoctor}</div>
            <div style={{ color: '#64748b', fontSize: '8pt' }}>Signature / التوقيع</div>
          </div>
        </div>

        {/* stamp area */}
        <div style={{
          width: '42mm', height: '22mm',
          border: '1px dashed #cbd5e1', borderRadius: '2mm',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#cbd5e1', fontSize: '8pt',
        }}>
          Official Stamp / الختم
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{
        marginTop: '6mm', paddingTop: '3mm',
        borderTop: '1px solid #e2e8f0',
        display: 'flex', justifyContent: 'space-between',
        fontSize: '7.5pt', color: '#94a3b8',
      }}>
        <span>Fadl Clinic Management System</span>
        <span>Valid 30 days · صالحة 30 يوماً · {fmtDate(rx.createdAt)}</span>
      </footer>
    </div>
  );
}
