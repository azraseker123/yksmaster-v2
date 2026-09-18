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
  Browser POST / PUT / PATCH / DELETE
  isteklerinde başka bir origin'den gelen
  isteği reddeder.

  Origin header'ı olmayan server-to-server
  istekler engellenmez.

  Bu önemli çünkü ileride Shopier webhook'u
  tarayıcıdan gelmeyebilir.
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
      ? req.headers.origin
      : '';

  /*
    Browser dışı/server-to-server çağrılarda
    Origin bulunmayabilir.
  */
  if (!origin) {
    return true;
  }

  const forwardedHost =
    typeof req.headers[
      'x-forwarded-host'
    ] === 'string'
      ? req.headers[
          'x-forwarded-host'
        ].split(',')[0].trim()
      : '';

  const host =
    forwardedHost ||
    (
      typeof req.headers.host ===
        'string'
        ? req.headers.host.trim()
        : ''
    );

  if (!host) {
    return false;
  }

  try {
    const originUrl =
      new URL(origin);

    return (
      originUrl.host
        .toLowerCase() ===
      host.toLowerCase()
    );

  } catch {
    return false;
  }
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
    Çok uzun/garip route değerlerini
    daha handler aramadan reddet.
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
    ROUTES.get(route);


  if (!routeHandler) {
    return res
      .status(404)
      .json({
        error:
          'API endpoint bulunamadı.'
      });
  }


  /*
    "route" yalnızca iç routing için.
    Alt handler'a taşımıyoruz.
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
      stack trace / DB mesajı gibi
      detayları kullanıcıya sızmasın.
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
