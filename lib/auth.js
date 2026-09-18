import jwt from 'jsonwebtoken';

import { query } from './db.js';
import {
  accessFor,
  effectivePlan
} from './plans.js';

const COOKIE_NAME = 'yks_session';
const PREVIEW_COOKIE = 'yks_preview_plan';

const SESSION_DAYS = 30;

const JWT_ISSUER = 'yks-master-360';
const JWT_AUDIENCE = 'yks-master-360-web';

function jwtSecret() {
  const secret =
    process.env.JWT_SECRET;

  if (!secret) {
    throw new Error(
      'JWT_SECRET environment variable is missing'
    );
  }

  if (secret.length < 32) {
    throw new Error(
      'JWT_SECRET must be at least 32 characters'
    );
  }

  return secret;
}

export function parseCookies(
  header = ''
) {
  const out = {};

  for (
    const part of header.split(';')
  ) {
    const trimmed =
      part.trim();

    if (!trimmed) continue;

    const index =
      trimmed.indexOf('=');

    const key =
      index >= 0
        ? trimmed.slice(0, index)
        : trimmed;

    const value =
      index >= 0
        ? trimmed.slice(index + 1)
        : '';

    try {
      out[
        decodeURIComponent(key)
      ] =
        decodeURIComponent(value);

    } catch {
      out[key] = value;
    }
  }

  return out;
}

export function createSessionToken(
  user
) {
  return jwt.sign(
    {
      userId: Number(user.id),
      sessionVersion:
        Number(
          user.session_version || 0
        )
    },
    jwtSecret(),
    {
      algorithm: 'HS256',
      expiresIn:
        `${SESSION_DAYS}d`,
      issuer:
        JWT_ISSUER,
      audience:
        JWT_AUDIENCE
    }
  );
}

export function verifySessionToken(
  token
) {
  try {
    return jwt.verify(
      token,
      jwtSecret(),
      {
        algorithms: ['HS256'],
        issuer:
          JWT_ISSUER,
        audience:
          JWT_AUDIENCE
      }
    );

  } catch {
    return null;
  }
}

export function getSession(req) {
  const cookies =
    parseCookies(
      req.headers.cookie || ''
    );

  const token =
    cookies[COOKIE_NAME];

  if (!token) {
    return null;
  }

  return verifySessionToken(
    token
  );
}

function cookieSecurity() {
  return (
    process.env.NODE_ENV ===
    'production'
      ? '; Secure'
      : ''
  );
}

export function sessionCookie(
  token
) {
  return (
    `${COOKIE_NAME}=` +
    `${encodeURIComponent(token)}` +
    '; HttpOnly' +
    '; Path=/' +
    `; Max-Age=${SESSION_DAYS * 86400}` +
    '; SameSite=Lax' +
    cookieSecurity()
  );
}

export function clearSessionCookie() {
  return (
    `${COOKIE_NAME}=` +
    '; HttpOnly' +
    '; Path=/' +
    '; Max-Age=0' +
    '; SameSite=Lax' +
    cookieSecurity()
  );
}

export function adminPreviewCookie(
  plan
) {
  const safePlan =
    [
      'none',
      'basic',
      'ai_pro'
    ].includes(plan)
      ? plan
      : 'ai_pro';

  return (
    `${PREVIEW_COOKIE}=` +
    `${encodeURIComponent(safePlan)}` +
    '; HttpOnly' +
    '; Path=/' +
    `; Max-Age=${7 * 86400}` +
    '; SameSite=Lax' +
    cookieSecurity()
  );
}

export async function getCurrentUser(
  req
) {
  const session =
    getSession(req);

  if (!session) {
    return null;
  }

  const userId =
    Number(session.userId);

  if (
    !Number.isSafeInteger(userId) ||
    userId <= 0
  ) {
    return null;
  }

  const result =
    await query(
      `SELECT *
       FROM yks2_users
       WHERE id = $1
       LIMIT 1`,
      [userId]
    );

  const user =
    result.rows[0];

  if (!user) {
    return null;
  }

  if (
    Number(
      session.sessionVersion || 0
    ) !==
    Number(
      user.session_version || 0
    )
  ) {
    return null;
  }

  // Admin yetkisinin tek kaynağı DB'deki role alanıdır.
  if (
    ![
      'user',
      'admin'
    ].includes(user.role)
  ) {
    return null;
  }

  user.effectivePlan =
    effectivePlan(user);

  if (
    user.role === 'admin'
  ) {
    const cookies =
      parseCookies(
        req.headers.cookie || ''
      );

    const preview =
      cookies[
        PREVIEW_COOKIE
      ];

    if (
      [
        'none',
        'basic',
        'ai_pro'
      ].includes(preview)
    ) {
      user.effectivePlan =
        preview;
    }
  }

  user.access =
    accessFor(user);

  return user;
}

export async function requireUser(
  req,
  res,
  {
    paid = false,
    pro = false,
    admin = false
  } = {}
) {
  const user =
    await getCurrentUser(req);

  if (!user) {
    res.status(401).json({
      error:
        'Oturum bulunamadı.'
    });

    return null;
  }

  if (
    admin &&
    user.role !== 'admin'
  ) {
    res.status(403).json({
      error:
        'Admin yetkisi gerekli.'
    });

    return null;
  }

  if (
    pro &&
    user.effectivePlan !==
      'ai_pro'
  ) {
    res.status(403).json({
      error:
        'Bu özellik AI Pro paketine özel.'
    });

    return null;
  }

  if (
    paid &&
    ![
      'basic',
      'ai_pro'
    ].includes(
      user.effectivePlan
    )
  ) {
    res.status(403).json({
      error:
        'Aktif bir paket gerekli.',
      code:
        'PLAN_REQUIRED'
    });

    return null;
  }

  return user;
}
