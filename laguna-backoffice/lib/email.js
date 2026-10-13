// Booking confirmation email, sent through Resend.
//
// Sending never decides whether a booking succeeded: the slot is already
// claimed and the row written by the time this runs. If the key is missing or
// Resend is down, the booking stands and the failure is logged.

import { TZ, SCHEDULE } from './availability.js';

const TROY_SMS = '949-280-5818';
const SITE = 'https://surfinglagunabeach.com';

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function money(cents) {
  const d = cents / 100;
  return '$' + (Number.isInteger(d) ? d.toLocaleString('en-US') : d.toFixed(2));
}

function whenText(startsAt) {
  const d = new Date(startsAt);
  const day = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'long', month: 'long', day: 'numeric' }).format(d);
  const time = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' }).format(d);
  return { day, time };
}

function calendarLink(ref, startsAt) {
  const st = new Date(startsAt);
  const en = new Date(st.getTime() + SCHEDULE.durationMin * 60000);
  const g = x => x.toISOString().replace(/[-:]|\.\d{3}/g, '');
  return 'https://calendar.google.com/calendar/render?action=TEMPLATE'
    + '&text=' + encodeURIComponent('Surf lesson with Troy - Laguna Surf Lessons')
    + '&dates=' + g(st) + '/' + g(en)
    + '&details=' + encodeURIComponent(`Booking ${ref}. Troy texts you the spot before your lesson. Questions: text Troy at ${TROY_SMS}.`);
}

export function renderConfirmation(b) {
  const { day, time } = whenText(b.startsAt);
  const subject = `You're booked: ${b.lesson}, ${day} at ${time}`;
  const rows = [
    ['Booking', b.ref],
    ['Lesson', `${b.lesson}, ${SCHEDULE.durationMin} minutes`],
    ['When', `${day} at ${time}`],
    ['Surfers', b.names.join(', ')],
  ];
  if (b.addons.length) rows.push(['Add-ons', b.addons.map(a => a.name).join(', ')]);
  if (b.giftCents) rows.push(['Gift card', '-' + money(b.giftCents)]);
  rows.push(['Total', money(b.totalCents) + (b.totalCents ? ', paid at your lesson' : '')]);

  const text = [
    `You're booked with Troy.`,
    '',
    ...rows.map(([k, v]) => `${k}: ${v}`),
    '',
    `WHERE: Troy picks the spot for each lesson based on the conditions, safety and your ability, and texts you where to meet before your lesson.`,
    '',
    `BRING: A towel, sunscreen, water and a swimsuit to wear under the wetsuit. The board, wetsuit and leash are included. Arrive 15 minutes early.`,
    '',
    `CHANGES: Text Troy at ${TROY_SMS}. Full refund with 24 hours' notice, or if Troy calls it off for conditions. Free reschedule with 12 hours' notice.`,
    '',
    `Add to your calendar: ${calendarLink(b.ref, b.startsAt)}`,
    '',
    `Laguna Surf Lessons - ${SITE}`,
  ].join('\n');

  const tr = rows.map(([k, v]) => `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #E6D6BA;color:#6B5D57;font-size:13px;letter-spacing:.08em;text-transform:uppercase;width:120px;vertical-align:top">${esc(k)}</td>
      <td style="padding:10px 0;border-bottom:1px solid #E6D6BA;color:#3E3330;font-size:16px;font-weight:600">${esc(v)}</td>
    </tr>`).join('');

  const html = `<!doctype html><html><body style="margin:0;background:#FBEFD9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#3E3330">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FBEFD9"><tr><td align="center" style="padding:28px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFAF1;border-radius:16px;overflow:hidden">
  <tr><td style="height:8px;background:linear-gradient(90deg,#F3C244 0 20%,#EE8F2E 20% 40%,#DF5B2C 40% 60%,#C13B33 60% 80%,#2E7C9B 80%);background-color:#EE8F2E"></td></tr>
  <tr><td style="padding:28px 28px 8px">
    <img src="${SITE}/apple-touch-icon.png" width="64" height="64" alt="Laguna Surf Lessons" style="display:block;border-radius:12px">
    <h1 style="margin:20px 0 6px;font-size:28px;line-height:1.15;color:#3E3330">You're booked with Troy.</h1>
    <p style="margin:0;font-size:16px;line-height:1.5;color:#3E3330">Keep this email. It has everything you need for your lesson.</p>
  </td></tr>
  <tr><td style="padding:12px 28px 4px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${tr}</table></td></tr>
  <tr><td style="padding:20px 28px 0">
    <p style="margin:0 0 6px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#A93B27;font-weight:700">Where</p>
    <p style="margin:0;font-size:16px;line-height:1.55">Troy picks the spot for each lesson based on the conditions, safety and your ability, and texts you where to meet before your lesson.</p>
  </td></tr>
  <tr><td style="padding:18px 28px 0">
    <p style="margin:0 0 6px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#A93B27;font-weight:700">Bring</p>
    <p style="margin:0;font-size:16px;line-height:1.55">A towel, sunscreen, water and a swimsuit to wear under the wetsuit. The board, wetsuit and leash are included. Arrive 15 minutes early.</p>
  </td></tr>
  <tr><td style="padding:18px 28px 0">
    <p style="margin:0 0 6px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#A93B27;font-weight:700">Need to change it?</p>
    <p style="margin:0;font-size:16px;line-height:1.55">Text Troy at <b>${TROY_SMS}</b>. Full refund with 24 hours' notice, or if Troy calls it off for conditions. Free reschedule with 12 hours' notice.</p>
  </td></tr>
  <tr><td style="padding:24px 28px 28px">
    <a href="${esc(calendarLink(b.ref, b.startsAt))}" style="display:inline-block;background:#C7431E;color:#FFFFFF;text-decoration:none;font-weight:600;font-size:16px;padding:14px 24px;border-radius:999px">Add to calendar</a>
  </td></tr>
</table>
<p style="margin:18px 0 0;font-size:13px;color:#6B5D57">Laguna Surf Lessons &middot; <a href="${SITE}" style="color:#6B5D57">surfinglagunabeach.com</a></p>
</td></tr></table></body></html>`;

  return { subject, html, text };
}

export async function sendConfirmation(to, booking) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, error: 'RESEND_API_KEY not set' };
  const { subject, html, text } = renderConfirmation(booking);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      signal: ctrl.signal,
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.MAIL_FROM || 'Laguna Surf Lessons <bookings@demetyr.com>',
        to: [to],
        subject, html, text,
        tags: [{ name: 'type', value: 'booking_confirmation' }],
      }),
    });
    const j = await r.json().catch(() => ({}));
    return r.ok ? { ok: true, id: j.id } : { ok: false, error: j.message || `HTTP ${r.status}` };
  } catch (err) {
    return { ok: false, error: err.name === 'AbortError' ? 'timeout' : err.message };
  } finally {
    clearTimeout(timer);
  }
}
