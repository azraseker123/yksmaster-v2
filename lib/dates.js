const ISTANBUL_TZ = 'Europe/Istanbul';

export function turkeyDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: ISTANBUL_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

export function addDays(dateString, days) {
  const [y, m, d] = String(dateString).split('-').map(Number);
  const base = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  base.setUTCDate(base.getUTCDate() + Number(days || 0));
  return base.toISOString().slice(0, 10);
}

export const TURKEY_SQL_DATE = `(NOW() AT TIME ZONE 'Europe/Istanbul')::date`;
