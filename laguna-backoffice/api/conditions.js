// Live conditions for the surf check strip: swell and water from Open-Meteo
// Marine, wind from Open-Meteo Forecast. Fetched server-side so the browser
// never depends on a third party's CORS headers, and cached for ten minutes.

import { methodGuard } from '../lib/http.js';

export const SPOTS = [
  { name: 'Thalia Street',  lat: 33.5369, lon: -117.7769 },
  { name: 'Brooks Street',  lat: 33.5327, lon: -117.7776 },
  { name: 'Aliso Creek',    lat: 33.5089, lon: -117.7524 },
  { name: 'Salt Creek',     lat: 33.4776, lon: -117.7246 },
  { name: 'Doheny',         lat: 33.4610, lon: -117.6854 },
  { name: 'San Clemente',   lat: 33.4195, lon: -117.6205 },
  { name: 'Upper Trestles', lat: 33.3845, lon: -117.5945 },
  { name: 'Lower Trestles', lat: 33.3814, lon: -117.5884 },
];

const TTL = 10 * 60 * 1000;
const cache = new Map();

async function getJson(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 5000);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

export default async function handler(req, res) {
  if (!methodGuard(req, res, 'GET')) return;
  const i = Number(req.query?.spot);
  const spot = SPOTS[Number.isInteger(i) ? i : -1];
  if (!spot) return res.status(400).json({ error: 'unknown spot' });

  const hit = cache.get(i);
  if (hit && Date.now() - hit.at < TTL) return res.status(200).json(hit.data);

  const q = `latitude=${spot.lat}&longitude=${spot.lon}&timezone=America%2FLos_Angeles`;
  const [marine, wind] = await Promise.allSettled([
    getJson(`https://marine-api.open-meteo.com/v1/marine?${q}&current=swell_wave_height,swell_wave_period,swell_wave_direction,sea_surface_temperature`),
    getJson(`https://api.open-meteo.com/v1/forecast?${q}&current=wind_speed_10m,wind_direction_10m&wind_speed_unit=mph`),
  ]);
  const m = marine.status === 'fulfilled' ? marine.value.current || {} : {};
  const w = wind.status === 'fulfilled' ? wind.value.current || {} : {};
  const data = {
    spot: spot.name,
    swellM: m.swell_wave_height ?? null,
    swellPeriodS: m.swell_wave_period ?? null,
    swellDirDeg: m.swell_wave_direction ?? null,
    waterC: m.sea_surface_temperature ?? null,
    windMph: w.wind_speed_10m ?? null,
    windDirDeg: w.wind_direction_10m ?? null,
    at: m.time || w.time || null,
  };
  if (marine.status === 'fulfilled' || wind.status === 'fulfilled') cache.set(i, { at: Date.now(), data });
  res.status(200).json(data);
}
