// What the back office needs to know about itself: the schedule it is running,
// and the calendar URL to hand Troy.

import { requireAdmin } from '../../lib/auth.js';
import { methodGuard } from '../../lib/http.js';
import { SCHEDULE, LESSONS, ADDONS, timesFor, todayLocal } from '../../lib/availability.js';

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;
  if (!methodGuard(req, res, 'GET')) return;

  const token = process.env.CALENDAR_TOKEN || '';
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'laguna.demetyr.com';
  const proto = process.env.VERCEL ? 'https' : 'http';

  res.status(200).json({
    today: todayLocal(),
    schedule: {
      durationMin: SCHEDULE.durationMin,
      timesAllYear: SCHEDULE.timesAllYear,
      timesInSeason: SCHEDULE.timesInSeason,
      seasonMonths: SCHEDULE.seasonMonths,
      daysOff: SCHEDULE.daysOff,
      leadTimeHours: SCHEDULE.leadTimeHours,
      horizonDays: SCHEDULE.horizonDays,
    },
    todayTimes: timesFor(todayLocal()),
    lessons: LESSONS,
    addons: ADDONS,
    calendarUrl: token ? `${proto}://${host}/api/calendar/${token}.ics` : null,
    calendarConfigured: Boolean(token),
  });
}
