import bcrypt from 'bcryptjs';
import crypto from 'crypto';

import { sendEmail } from '../../lib/email.js';
import { query } from '../../lib/db.js';
import {
  onlyMethods,
  text,
  int,
  normalizeEmail
} from '../../lib/http.js';

const TRACKS = new Set([
  'sayisal',
  'esit_agirlik',
  'sozel'
]);

export default async function handler(req, res) {
  if (!onlyMethods(req, res, ['POST'])) return;

  const name = text(req.body?.name, 100);
  const email = normalizeEmail(req.body?.email);
  const password = String(req.body?.password || '');

  const track = text(req.body?.track, 30);
  const targetCity = text(req.body?.targetCity, 100);
  const targetUniversity = text(
    req.body?.targetUniversity,
    160
  );

  const targetDepartment = text(
    req.body?.targetDepartment,
    160
  );

  const targetRank = int(
    req.body?.targetRank,
    1,
    5000000
  );

  if (
    !name ||
    !email ||
    !password ||
    !TRACKS.has(track) ||
    !targetCity ||
    !targetDepartment ||
    !targetRank
  ) {
    return res.status(400).json({
      error:
        'Lütfen zorunlu alanların tamamını doldur.'
    });
  }

  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return res.status(400).json({
      error: 'Geçerli bir e-posta gir.'
    });
  }

  if (
    password.length < 8 ||
    password.length > 128
  ) {
    return res.status(400).json({
      error:
        'Şifre 8 ile 128 karakter arasında olmalı.'
    });
  }

  try {
    const exists = await query(
      `SELECT id
       FROM yks2_users
       WHERE email = $1
       LIMIT 1`,
      [email]
    );

    if (exists.rows.length) {
      return res.status(409).json({
        error:
          'Bu e-posta ile kayıtlı bir hesap var.'
      });
    }

    const passwordHash =
      await bcrypt.hash(password, 12);

    const adminEmail =
      (process.env.ADMIN_EMAIL || '')
        .trim()
        .toLowerCase();

    const role =
      adminEmail && email === adminEmail
        ? 'admin'
        : 'user';

    const plan =
      role === 'admin'
        ? 'ai_pro'
        : 'none';

    const planExpiresAt =
      role === 'admin'
        ? new Date(
            '2099-12-31T23:59:59Z'
          )
        : null;

    const rawVerifyToken =
      crypto.randomBytes(32).toString('hex');

    const verifyTokenHash =
      crypto
        .createHash('sha256')
        .update(rawVerifyToken)
        .digest('hex');

    const result = await query(
      `INSERT INTO yks2_users(
        name,
        email,
        password_hash,
        track,
        target_city,
        target_university,
        target_department,
        target_rank,
        role,
        plan,
        plan_expires_at,
        email_verify_token_hash,
        email_verify_expires_at,
        email_verify_last_sent_at
      )
      VALUES(
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9,
        $10,
        $11,
        $12,
        NOW() + INTERVAL '24 hours',
        NOW()
      )
      RETURNING id, email`,
      [
        name,
        email,
        passwordHash,
        track,
        targetCity,
        targetUniversity,
        targetDepartment,
        targetRank,
        role,
        plan,
        planExpiresAt,
        verifyTokenHash
      ]
    );

    const user = result.rows[0];

    const baseUrl =
      process.env.APP_URL ||
      'https://yksmaster-v.vercel.app';

    const verifyUrl =
      `${baseUrl}/?verifyEmailToken=` +
      encodeURIComponent(rawVerifyToken);

    try {
      await sendEmail({
        to: email,
        subject:
          'YKS Master 360 - E-posta Doğrulama',

        html: `
          <div style="font-family:Arial,sans-serif;line-height:1.6">
            <h2>E-posta adresini doğrula</h2>

            <p>
              YKS Master 360 hesabını kullanmaya devam etmek için
              e-posta adresini doğrula.
            </p>

            <p>
              <a
                href="${verifyUrl}"
                style="
                  display:inline-block;
                  padding:12px 18px;
                  background:#0B1F3A;
                  color:white;
                  text-decoration:none;
                  border-radius:8px;
                "
              >
                E-postamı Doğrula
              </a>
            </p>

            <p>
              Bu bağlantı 24 saat boyunca geçerlidir.
            </p>

            <p>
              Bu hesabı sen oluşturmadıysan bu e-postayı
              görmezden gelebilirsin.
            </p>
          </div>
        `
      });

    } catch (emailErr) {
      await query(
        `DELETE FROM yks2_users
         WHERE id = $1`,
        [user.id]
      );

      throw emailErr;
    }

    return res.status(201).json({
      ok: true,
      verificationRequired: true,
      message:
        'Hesabın oluşturuldu. E-posta adresine gönderilen doğrulama bağlantısına tıkla.'
    });

  } catch (err) {
    console.error(
      'Register error:',
      err
    );

    if (err?.code === '23505') {
      return res.status(409).json({
        error:
          'Bu e-posta ile kayıtlı bir hesap var.'
      });
    }

    return res.status(500).json({
      error:
        'Kayıt sırasında sunucu hatası oluştu.'
    });
  }
}
