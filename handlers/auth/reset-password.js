import crypto from 'crypto';
import bcrypt from 'bcryptjs';

import { query } from '../../lib/db.js';
import { onlyMethods } from '../../lib/http.js';

export default async function handler(req, res) {
  if (!onlyMethods(req, res, ['POST'])) return;

  const token = String(req.body?.token || '');
  const newPassword = String(
    req.body?.newPassword || ''
  );

  if (!token) {
    return res.status(400).json({
      error:
        'Şifre sıfırlama bağlantısı geçersiz.'
    });
  }

  if (
    newPassword.length < 8 ||
    newPassword.length > 128
  ) {
    return res.status(400).json({
      error:
        'Yeni şifre 8 ile 128 karakter arasında olmalı.'
    });
  }

  try {
    const tokenHash = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');

    const result = await query(
      `SELECT id
       FROM yks2_users
       WHERE password_reset_token_hash = $1
         AND password_reset_expires_at > NOW()
       LIMIT 1`,
      [tokenHash]
    );

    const user = result.rows[0];

    if (!user) {
      return res.status(400).json({
        error:
          'Bu şifre sıfırlama bağlantısı geçersiz veya süresi dolmuş.'
      });
    }

    const passwordHash =
      await bcrypt.hash(newPassword, 12);

    await query(
      `UPDATE yks2_users
       SET
         password_hash = $1,
         password_reset_token_hash = NULL,
         password_reset_expires_at = NULL,
         password_reset_last_sent_at = NULL,
         session_version = session_version + 1,
         failed_login_count = 0,
         locked_until = NULL,
         updated_at = NOW()
       WHERE id = $2`,
      [
        passwordHash,
        user.id
      ]
    );

    return res.status(200).json({
      ok: true,
      message:
        'Şifren başarıyla değiştirildi.'
    });

  } catch (err) {
    console.error(
      'Reset password error:',
      err
    );

    return res.status(500).json({
      error:
        'Şifre sıfırlanamadı.'
    });
  }
}
