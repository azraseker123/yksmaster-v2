import bcrypt from 'bcryptjs';
import { query } from '../../lib/db.js';
import { createSessionToken, sessionCookie } from '../../lib/auth.js';
import { onlyMethods, normalizeEmail, publicUser } from '../../lib/http.js';
import { accessFor, effectivePlan } from '../../lib/plans.js';

export default async function handler(req, res) {
  if (!onlyMethods(req, res, ['POST'])) return;

  const email = normalizeEmail(req.body?.email);
  const password = String(req.body?.password || '');

  if (!email || !password) {
    return res.status(400).json({
      error: 'E-posta ve şifre gerekli.'
    });
  }

  if (password.length > 128) {
    return res.status(401).json({
      error: 'E-posta veya şifre hatalı.'
    });
  }

  try {
    const r = await query(
      `SELECT * FROM yks2_users WHERE email = $1`,
      [email]
    );

    const user = r.rows[0];

    if (
      user?.locked_until &&
      new Date(user.locked_until).getTime() > Date.now()
    ) {
      return res.status(429).json({
        error:
          'Çok fazla başarısız giriş denemesi oldu. 15 dakika sonra tekrar dene.'
      });
    }

    if (
      user?.locked_until &&
      new Date(user.locked_until).getTime() <= Date.now()
    ) {
      await query(
        `UPDATE yks2_users
         SET
           failed_login_count = 0,
           locked_until = NULL
         WHERE id = $1`,
        [user.id]
      );

      user.failed_login_count = 0;
      user.locked_until = null;
    }

    const passwordOk = user
      ? await bcrypt.compare(password, user.password_hash)
      : false;

    if (!user || !passwordOk) {
      if (user) {
        await query(
          `UPDATE yks2_users
           SET
             failed_login_count =
               COALESCE(failed_login_count, 0) + 1,
             locked_until =
               CASE
                 WHEN COALESCE(failed_login_count, 0) + 1 >= 5
                 THEN NOW() + INTERVAL '15 minutes'
                 ELSE locked_until
               END
           WHERE id = $1`,
          [user.id]
        );
      }

      return res.status(401).json({
        error: 'E-posta veya şifre hatalı.'
      });
    }

    if (!user.email_verified_at) {
      return res.status(403).json({
        error:
          'Giriş yapmadan önce e-posta adresini doğrulamalısın.',
        code: 'EMAIL_NOT_VERIFIED'
      });
    }

    const sessionResult = await query(
      `UPDATE yks2_users
       SET
         last_login_at = NOW(),
         failed_login_count = 0,
         locked_until = NULL,
         session_version = session_version + 1
       WHERE id = $1
       RETURNING session_version`,
      [user.id]
    );

    user.session_version =
      Number(sessionResult.rows[0]?.session_version || 0);

    const adminEmail =
      (process.env.ADMIN_EMAIL || '')
        .trim()
        .toLowerCase();

    if (
      adminEmail &&
      user.email?.toLowerCase() === adminEmail
    ) {
      user.role = 'admin';
    }

    user.effectivePlan = effectivePlan(user);

    res.setHeader(
      'Set-Cookie',
      sessionCookie(createSessionToken(user))
    );

    return res.status(200).json({
      user: publicUser(user),
      access: accessFor(user)
    });

  } catch (err) {
    console.error('Login error:', err);

    return res.status(500).json({
      error: 'Giriş sırasında sunucu hatası oluştu.'
    });
  }
}
