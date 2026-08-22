import jwt from 'jsonwebtoken';
import { query } from './db.js';
import { accessFor, effectivePlan } from './plans.js';

const COOKIE_NAME = 'yks_session';
const PREVIEW_COOKIE = 'yks_preview_plan';
const SESSION_DAYS = 30;

function jwtSecret() {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET environment variable is missing');
  return process.env.JWT_SECRET;
}

export function parseCookies(header='') {
  const out = {};
  for (const part of header.split(';')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const i = trimmed.indexOf('=');
    const k = i >= 0 ? trimmed.slice(0, i) : trimmed;
    const v = i >= 0 ? trimmed.slice(i + 1) : '';
    try { out[decodeURIComponent(k)] = decodeURIComponent(v); } catch { out[k] = v; }
  }
  return out;
}

export function createSessionToken(user) {
  return jwt.sign({ userId: user.id, email: user.email, role: user.role }, jwtSecret(), { expiresIn: `${SESSION_DAYS}d` });
}

export function verifySessionToken(token) {
  try { return jwt.verify(token, jwtSecret()); } catch { return null; }
}

export function getSession(req) {
  const token = parseCookies(req.headers.cookie || '')[COOKIE_NAME];
  return token ? verifySessionToken(token) : null;
}

function cookieSecurity() {
  return process.env.NODE_ENV === 'production' ? '; Secure' : '';
}

export function sessionCookie(token) {
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; Path=/; Max-Age=${SESSION_DAYS*86400}; SameSite=Lax${cookieSecurity()}`;
}

export function clearSessionCookie() {
  return `${COOKIE_NAME}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax${cookieSecurity()}`;
}

export function adminPreviewCookie(plan) {
  const safe = ['none','basic','ai_pro'].includes(plan) ? plan : 'ai_pro';
  return `${PREVIEW_COOKIE}=${encodeURIComponent(safe)}; HttpOnly; Path=/; Max-Age=${7*86400}; SameSite=Lax${cookieSecurity()}`;
}

export async function getCurrentUser(req) {
  const session = getSession(req);
  if (!session) return null;
  const r = await query(`SELECT * FROM yks2_users WHERE id=$1`, [session.userId]);
  const user = r.rows[0];
  if (!user) return null;

  // ADMIN_EMAIL is the source of truth for the owner's test account as well.
  // This makes an already-created account recover admin access after the env var is configured.
  const adminEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  if (adminEmail && user.email?.toLowerCase() === adminEmail) user.role = 'admin';

  user.effectivePlan = effectivePlan(user);
  if (user.role === 'admin') {
    const preview = parseCookies(req.headers.cookie || '')[PREVIEW_COOKIE];
    if (['none','basic','ai_pro'].includes(preview)) user.effectivePlan = preview;
  }
  user.access = accessFor(user);
  return user;
}

export async function requireUser(req, res, { paid=false, pro=false, admin=false }={}) {
  const user = await getCurrentUser(req);
  if (!user) { res.status(401).json({ error: 'Oturum bulunamadı.' }); return null; }
  if (admin && user.role !== 'admin') { res.status(403).json({ error: 'Admin yetkisi gerekli.' }); return null; }
  if (pro && user.effectivePlan !== 'ai_pro') { res.status(403).json({ error: 'Bu özellik AI Pro paketine özel.' }); return null; }
  if (paid && !['basic','ai_pro'].includes(user.effectivePlan)) { res.status(403).json({ error: 'Aktif bir paket gerekli.', code: 'PLAN_REQUIRED' }); return null; }
  return user;
}
