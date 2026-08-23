import { query } from './db.js';
import { turkeyDate } from './dates.js';

export async function recordActivity(userId, type, metadata={}, activityDate=null) {
  await query(
    `INSERT INTO yks2_activity_log(user_id,activity_type,activity_date,metadata)
     VALUES($1,$2,COALESCE($3::date,(NOW() AT TIME ZONE 'Europe/Istanbul')::date),$4::jsonb)`,
    [userId, type, activityDate, JSON.stringify(metadata || {})]
  );
}

export async function getStreak(userId) {
  const r = await query(
    SELECT DISTINCT activity_date::text AS d
FROM yks2_activity_log
WHERE user_id=$1
  AND activity_type = ANY($2::text[])
ORDER BY d DESC LIMIT 400
  );
  if (!r.rows.length) return { current: 0, longest: 0, lastActive: null };
  const dates = r.rows.map(x => x.d);
  const toDate = s => new Date(`${s}T12:00:00Z`);
  const diffDays = (a,b) => Math.round((toDate(a)-toDate(b))/86400000);
  const today = turkeyDate();
  let current = 0;
  const firstGap = Math.abs(diffDays(today, dates[0]));
  if (firstGap <= 1) {
    current = 1;
    for (let i=1;i<dates.length;i++) {
      if (diffDays(dates[i-1], dates[i]) === 1) current++; else break;
    }
  }
  let longest = dates.length ? 1 : 0, run = dates.length ? 1 : 0;
  for (let i=1;i<dates.length;i++) {
    if (diffDays(dates[i-1], dates[i]) === 1) run++; else run = 1;
    if (run > longest) longest = run;
  }
  return { current, longest, lastActive: dates[0] || null };
}
