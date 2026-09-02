import { availability, todayLocal, addDays, SCHEDULE } from '../lib/availability.js';
import { methodGuard } from '../lib/http.js';

export default async function handler(req, res) {
  if (!methodGuard(req, res, 'GET')) return;
  try {
    const today = todayLocal();
    const from = String(req.query?.from || today);
    const maxTo = addDays(today, SCHEDULE.horizonDays);
    let to = String(req.query?.to || addDays(today, 27));
    if (to > maxTo) to = maxTo;
    if (from > to) return res.status(400).json({ error: 'from is after to' });

    const days = await availability(from, to);
    res.status(200).json({
      from, to,
      durationMin: SCHEDULE.durationMin,
      leadTimeHours: SCHEDULE.leadTimeHours,
      days,
    });
  } catch (err) {
    console.error('availability failed', err);
    res.status(500).json({ error: 'could not load availability' });
  }
}
