// Render a signed waiver as a PDF. What Troy downloads is not a screenshot of a
// form — it is the release text as signed, with the signature block filled in
// and the digital-signature facts (when, from where) recorded on the page,
// because that is the part that matters if it is ever questioned.

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import {
  WAIVER_TITLE, WAIVER_INTRO, WAIVER_CLAUSES, WAIVER_CLOSING,
} from './waiver-text.js';

const PAGE = [612, 792];         // US Letter
const MARGIN = 54;
const WIDTH = PAGE[0] - MARGIN * 2;

function wrap(text, font, size, maxWidth) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    const next = line ? line + ' ' + w : w;
    if (font.widthOfTextAtSize(next, size) > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export async function waiverPdf(w) {
  const pdf = await PDFDocument.create();
  const body = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let page = pdf.addPage(PAGE);
  let y = PAGE[1] - MARGIN;

  const line = (text, { font = body, size = 9.5, gap = 4, color = rgb(0.12, 0.14, 0.16) } = {}) => {
    for (const l of wrap(text, font, size, WIDTH)) {
      if (y < MARGIN + 60) {
        page = pdf.addPage(PAGE);
        y = PAGE[1] - MARGIN;
      }
      page.drawText(l, { x: MARGIN, y, size, font, color });
      y -= size + 2.5;
    }
    y -= gap;
  };

  page.drawRectangle({ x: 0, y: PAGE[1] - 8, width: PAGE[0], height: 8, color: rgb(0.85, 0.25, 0.10) });

  line(WAIVER_TITLE, { font: bold, size: 14, gap: 10 });
  line(`Booking ${w.ref}  ·  ${w.lesson_name}  ·  ${w.local_date} at ${w.local_time}`, { size: 10, gap: 12 });
  line(WAIVER_INTRO, { gap: 8 });
  for (const c of WAIVER_CLAUSES) line(c, { gap: 7 });
  for (const c of WAIVER_CLOSING) line(c, { gap: 7 });

  y -= 8;
  if (y < MARGIN + 150) { page = pdf.addPage(PAGE); y = PAGE[1] - MARGIN; }
  page.drawLine({
    start: { x: MARGIN, y }, end: { x: PAGE[0] - MARGIN, y },
    thickness: 0.8, color: rgb(0.8, 0.82, 0.84),
  });
  y -= 18;

  line('SIGNATURE', { font: bold, size: 10, gap: 8 });
  const signedAt = new Date(w.signed_at);
  const rows = [
    ['Participant(s)', w.participant_names],
    ['Signed by', `${w.signed_by_name} (${w.signer_role === 'guardian' ? 'parent or legal guardian' : 'participant, 18 or older'})`],
    ['Signed', signedAt.toUTCString()],
    ['Valid until', new Date(w.expires_at).toUTCString()],
    ['Waiver version', w.waiver_version],
    ['Signed from', w.ip || 'not recorded'],
    ['Contact', [w.email, w.phone].filter(Boolean).join('  ·  ')],
  ];
  for (const [k, v] of rows) {
    if (y < MARGIN + 20) { page = pdf.addPage(PAGE); y = PAGE[1] - MARGIN; }
    page.drawText(k, { x: MARGIN, y, size: 9, font: bold, color: rgb(0.35, 0.39, 0.43) });
    page.drawText(String(v || '—'), { x: MARGIN + 110, y, size: 9, font: body, color: rgb(0.12, 0.14, 0.16) });
    y -= 15;
  }

  y -= 10;
  line('Agreed and signed electronically. The typed name above is the signer’s digital signature, ' +
       'recorded with the timestamp and address shown.', { size: 8, color: rgb(0.45, 0.48, 0.51) });

  return await pdf.save();
}
