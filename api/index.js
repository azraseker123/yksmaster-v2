import admin from '../handlers/admin.js';
import ai from '../handlers/ai.js';
import alerts from '../handlers/alerts.js';
import archive from '../handlers/archive.js';

import authForgotPassword from '../handlers/auth/forgot-password.js';
import authLogin from '../handlers/auth/login.js';
import authLogout from '../handlers/auth/logout.js';
import authMe from '../handlers/auth/me.js';
import authRegister from '../handlers/auth/register.js';
import authVerifyEmail from '../handlers/auth/verify-email.js';
import authResendVerification from '../handlers/auth/resend-verification.js';
import authResetPassword from '../handlers/auth/reset-password.js';

import shopier from '../handlers/shopier.js';

import badges from '../handlers/badges.js';
import curriculum from '../handlers/curriculum.js';
import dashboard from '../handlers/dashboard.js';
import duels from '../handlers/duels.js';
import exams from '../handlers/exams.js';
import leaderboard from '../handlers/leaderboard.js';
import license from '../handlers/license.js';
import planner from '../handlers/planner.js';
import questions from '../handlers/questions.js';
import resources from '../handlers/resources.js';
import setup from '../handlers/setup.js';
import sleep from '../handlers/sleep.js';
import study from '../handlers/study.js';

import deleteAccount from '../handlers/user/delete-account.js';
import exportData from '../handlers/user/export-data.js';
import profileUpdate from '../handlers/user/profile-update.js';
import profile from '../handlers/user/profile.js';


const ROUTES = new Map([
  ['admin', admin],
  ['ai', ai],
  ['alerts', alerts],
  ['archive', archive],

  [
    'auth/forgot-password',
    authForgotPassword
  ],
  [
    'auth/login',
    authLogin
  ],
  [
    'auth/logout',
    authLogout
  ],
  [
    'auth/me',
    authMe
  ],
  [
    'auth/register',
    authRegister
  ],
  [
    'auth/verify-email',
    authVerifyEmail
  ],
  [
    'auth/resend-verification',
    authResendVerification
  ],
  [
    'auth/reset-password',
    authResetPassword
  ],

  ['shopier', shopier],

  ['badges', badges],
  ['curriculum', curriculum],
  ['dashboard', dashboard],
  ['duels', duels],
  ['exams', exams],
  ['leaderboard', leaderboard],
  ['license', license],
  ['planner', planner],
  ['questions', questions],
  ['resources', resources],
  ['setup', setup],
  ['sleep', sleep],
  ['study', study],

  [
    'user/delete-account',
    deleteAccount
  ],
  [
    'user/export-data',
    exportData
  ],
  [
    'user/profile-update',
    profileUpdate
  ],
  [
    'user/profile',
    profile
  ]
]);


/*
  Bir URL değerini güvenli origin biçimine çevir.

  Örnek:
  https://example.com/path
  ->
  https://example.com
*/
function normalizeOrigin(value) {
  if (
    typeof value !== 'string' ||
    !value.trim()
  ) {
    return null;
  }

  try {
    return new URL(
      value.trim()
    ).origin.toLowerCase();

  } catch {
    return null;
  }
}


/*
  Bu deployment için kabul edilen origin'leri oluştur.

  1. APP_URL:
     Asıl production adresi.

  2. VERCEL_URL:
     Preview / Vercel deployment adresi.

  3. Host fallback:
     APP_URL henüz yapılandırılmadıysa uygulamanın
     çalışmayı tamamen bırakmaması için.
*/
function allowedOrigins(req) {
  const origins =
    new Set();


  const appOrigin =
    normalizeOrigin(
      process.env.APP_URL
    );

  if (appOrigin) {
    origins.add(
      appOrigin
    );
  }


  const vercelUrl =
    typeof process.env.VERCEL_URL ===
      'string'
      ? process.env.VERCEL_URL.trim()
      : '';

  if (vercelUrl) {
    const vercelOrigin =
      normalizeOrigin(
        `https://${vercelUrl}`
      );

    if (vercelOrigin) {
      origins.add(
        vercelOrigin
      );
    }
  }


  /*
    Host header Vercel tarafından gelen
    mevcut deployment hostudur.

    Burada x-forwarded-host kullanmıyoruz.
  */
  const host =
    typeof req.headers?.host ===
      'string'
      ? req.headers.host.trim()
      : '';


  if (host) {
    /*
      Production'da HTTPS bekliyoruz.

      Local development'ta HTTP kullanılabilir.
    */
    const protocol =
      process.env.NODE_ENV ===
        'production'
        ? 'https'
        : (
            typeof req.headers[
              'x-forwarded-proto'
            ] === 'string' &&
            req.headers[
              'x-forwarded-proto'
            ]
              .split(',')[0]
              .trim() === 'https'
              ? 'https'
              : 'http'
          );


    const hostOrigin =
      normalizeOrigin(
        `${protocol}://${host}`
      );

    if (hostOrigin) {
      origins.add(
        hostOrigin
      );
    }
  }


  return origins;
}


/*
  Browser kaynaklı state-changing isteklerde
  cross-site çağrıları reddeder.

  POST / PUT / PATCH / DELETE korunur.

  Server-to-server webhook çağrılarında Origin
  bulunmayabilir. Bu nedenle Origin yoksa
  Sec-Fetch-Site bilgisine de bakıyoruz.

  Cross-site browser isteği olduğu açıkça
  görülüyorsa Origin olmasa bile reddedilir.
*/
function originAllowed(req) {
  const method =
    String(
      req.method ||
      ''
    ).toUpperCase();


  if (
    ![
      'POST',
      'PUT',
      'PATCH',
      'DELETE'
    ].includes(method)
  ) {
    return true;
  }


  const origin =
    typeof req.headers?.origin ===
      'string'
      ? req.headers.origin.trim()
      : '';


  const fetchSite =
    typeof req.headers[
      'sec-fetch-site'
    ] === 'string'
      ? req.headers[
          'sec-fetch-site'
        ]
          .trim()
          .toLowerCase()
      : '';


  /*
    Origin yok ama browser isteğinin açıkça
    cross-site olduğu görülüyorsa reddet.

    Server-to-server çağrılarda Sec-Fetch-Site
    genellikle bulunmaz.
  */
  if (!origin) {
    if (
      fetchSite === 'cross-site'
    ) {
      return false;
    }

    return true;
  }


  const requestOrigin =
    normalizeOrigin(
      origin
    );


  if (!requestOrigin) {
    return false;
  }


  const allowed =
    allowedOrigins(req);


  return allowed.has(
    requestOrigin
  );
}


export default async function handler(
  req,
  res
) {
  /*
    Bütün API cevaplarına merkezi
    güvenlik/cache header'ları.
  */
  res.setHeader(
    'Cache-Control',
    'no-store'
  );

  res.setHeader(
    'Pragma',
    'no-cache'
  );

  res.setHeader(
    'X-Content-Type-Options',
    'nosniff'
  );

  res.setHeader(
    'Referrer-Policy',
    'no-referrer'
  );

  res.setHeader(
    'X-Frame-Options',
    'DENY'
  );

  res.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=()'
  );


  /*
    Browser kaynaklı cross-origin
    state-changing istekleri reddet.
  */
  if (
    !originAllowed(req)
  ) {
    return res
      .status(403)
      .json({
        error:
          'İstek kaynağına izin verilmiyor.'
      });
  }


  const rawRoute =
    Array.isArray(
      req.query?.route
    )
      ? req.query.route.join('/')
      : req.query?.route;


  const route =
    String(
      rawRoute ||
      ''
    )
      .replace(
        /^\/+|\/+$/g,
        ''
      );


  /*
    Çok uzun / anlamsız route değerlerini
    handler aramadan reddet.
  */
  if (
    !route ||
    route.length > 100
  ) {
    return res
      .status(404)
      .json({
        error:
          'API endpoint bulunamadı.'
      });
  }


  const routeHandler =
    ROUTES.get(
      route
    );


  if (!routeHandler) {
    return res
      .status(404)
      .json({
        error:
          'API endpoint bulunamadı.'
      });
  }


  /*
    route yalnızca merkezi routing için.

    Alt handler'a gereksiz query parametresi
    taşımıyoruz.
  */
  if (
    req.query &&
    Object.prototype
      .hasOwnProperty
      .call(
        req.query,
        'route'
      )
  ) {
    delete req.query.route;
  }


  try {
    return await routeHandler(
      req,
      res
    );

  } catch (err) {
    /*
      Beklenmeyen handler hatalarının
      stack trace / SQL mesajı / dosya yolu
      gibi detaylarını kullanıcıya sızdırma.
    */
    console.error(
      `Unhandled API error [${route}]:`,
      err
    );


    if (
      res.headersSent
    ) {
      return;
    }


    return res
      .status(500)
      .json({
        error:
          'Beklenmeyen bir sunucu hatası oluştu.'
      });
  }
}
