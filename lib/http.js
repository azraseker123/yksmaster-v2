export function noStore(res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
}

export function onlyMethods(req, res, methods) {
  const allowed = Array.isArray(methods) ? methods : [methods];
  if (!allowed.includes(req.method)) {
    res.setHeader('Allow', allowed.join(', '));
    res.status(405).json({ error: 'Method not allowed' });
    return false;
  }
  return true;
}

export function text(value, max=500) {
  return String(value ?? '').trim().slice(0, max);
}

export function int(value, min=Number.MIN_SAFE_INTEGER, max=Number.MAX_SAFE_INTEGER) {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) return null;
  return n;
}

export function num(value, min=-Infinity, max=Infinity) {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return n;
}

export function dateOnly(value) {
  const s = text(value, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const y=Number(m[1]),mo=Number(m[2]),d=Number(m[3]);
  const dt=new Date(Date.UTC(y,mo-1,d));
  return dt.getUTCFullYear()===y && dt.getUTCMonth()===mo-1 && dt.getUTCDate()===d ? s : null;
}

export function normalizeEmail(value='') {
  return text(value, 180).toLowerCase();
}

export function publicUser(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    track: row.track,
    targetCity: row.target_city,
    targetUniversity: row.target_university,
    targetDepartment: row.target_department,
    targetRank: row.target_rank,
    role: row.role,
    plan: row.effectivePlan || row.plan,
    planExpiresAt: row.plan_expires_at,
    createdAt: row.created_at
  };
}
