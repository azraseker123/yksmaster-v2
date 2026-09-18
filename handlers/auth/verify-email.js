import crypto from 'crypto';

import { query } from '../../lib/db.js';

import {
  onlyMethods
} from '../../lib/http.js';


export default async function handler(
  req,
  res
) {
  if (
    !onlyMethods(
      req,
      res,
      ['POST']
    )
  ) {
    return;
  }

  const token =
    String(
      req.body?.token ||
      ''
    );

  if (!token) {
    return res
      .status(400)
      .json({
        error:
          'Doğrulama bağlantısı geçersiz.'
      });
  }

  try {
    const tokenHash =
      crypto
        .createHash('sha256')
        .update(token)
        .digest('hex');

    /*
      Tokenı tek SQL işlemiyle tüketiyoruz.
      Böylece aynı token eşzamanlı iki istekte
      iki kere kullanılamaz.
    */
    const result =
      await query(
        `UPDATE yks2_users
         SET
           email_verified_at = NOW(),
           email_verify_token_hash = NULL,
           email_verify_expires_at = NULL,
           email_verify_last_sent_at = NULL,
           updated_at = NOW()
         WHERE
           email_verify_token_hash = $1
           AND email_verify_expires_at > NOW()
           AND email_verified_at IS NULL
         RETURNING id`,
        [
          tokenHash
        ]
      );

    if (
      !result.rows.length
    ) {
      return res
        .status(400)
        .json({
          error:
            'Doğrulama bağlantısı geçersiz veya süresi dolmuş.'
        });
    }

    return res
      .status(200)
      .json({
        ok: true,
        message:
          'E-posta adresin doğrulandı.'
      });

  } catch (err) {
    console.error(
      'Verify email error:',
      err
    );

    return res
      .status(500)
      .json({
        error:
          'E-posta doğrulanamadı.'
      });
  }
}
