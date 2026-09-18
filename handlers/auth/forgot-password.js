import crypto from 'crypto';

import { query } from '../../lib/db.js';
import { sendEmail } from '../../lib/email.js';

import {
  onlyMethods,
  normalizeEmail,
  noStore
} from '../../lib/http.js';


function getAppUrl() {
  const raw =
    String(
      process.env.APP_URL ||
      'https://yksmaster-v.vercel.app'
    ).trim();

  try {
    const url = new URL(raw);

    if (
      url.protocol !== 'https:' &&
      url.protocol !== 'http:'
    ) {
      return null;
    }

    return url.origin;

  } catch {
    return null;
  }
}


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

  noStore(res);

  const email =
    normalizeEmail(
      req.body?.email
    );

  const genericResponse = {
    ok: true,
    message:
      'Bu e-posta kayıtlıysa şifre sıfırlama bağlantısı gönderildi.'
  };


  /*
    Geçersiz veya boş e-posta için de
    hesap var/yok bilgisini dışarı vermiyoruz.
  */
  if (
    !email ||
    !/^\S+@\S+\.\S+$/.test(
      email
    )
  ) {
    return res
      .status(200)
      .json(
        genericResponse
      );
  }


  try {
    const result =
      await query(
        `SELECT
          id,
          email,
          password_reset_last_sent_at
         FROM yks2_users
         WHERE email = $1
         LIMIT 1`,
        [
          email
        ]
      );

    const user =
      result.rows[0];


    /*
      Hesap yoksa yine aynı cevabı dön.
    */
    if (!user) {
      return res
        .status(200)
        .json(
          genericResponse
        );
    }


    /*
      Aynı hesaba 2 dakika içinde tekrar
      şifre sıfırlama maili gönderme.
    */
    if (
      user.password_reset_last_sent_at &&
      Date.now() -
        new Date(
          user.password_reset_last_sent_at
        ).getTime() <
        2 * 60 * 1000
    ) {
      return res
        .status(200)
        .json(
          genericResponse
        );
    }


    const appUrl =
      getAppUrl();

    if (!appUrl) {
      console.error(
        'Invalid APP_URL configuration.'
      );

      return res
        .status(500)
        .json({
          error:
            'Şifre sıfırlama isteği oluşturulamadı.'
        });
    }


    const rawToken =
      crypto
        .randomBytes(32)
        .toString('hex');

    const tokenHash =
      crypto
        .createHash('sha256')
        .update(rawToken)
        .digest('hex');


    await query(
      `UPDATE yks2_users
       SET
         password_reset_token_hash = $1,
         password_reset_expires_at =
           NOW() + INTERVAL '30 minutes',
         password_reset_last_sent_at = NOW(),
         updated_at = NOW()
       WHERE id = $2`,
      [
        tokenHash,
        user.id
      ]
    );


    const resetUrl =
      `${appUrl}/?resetToken=` +
      encodeURIComponent(
        rawToken
      );


    try {
      await sendEmail({
        to:
          user.email,

        subject:
          'YKS Master 360 - Şifre Sıfırlama',

        html: `
          <div style="font-family:Arial,sans-serif;line-height:1.6">
            <h2>Şifreni sıfırla</h2>

            <p>Merhaba,</p>

            <p>
              YKS Master 360 hesabının şifresini
              sıfırlamak için aşağıdaki bağlantıya tıkla.
            </p>

            <p>
              <a
                href="${resetUrl}"
                style="
                  display:inline-block;
                  padding:12px 18px;
                  background:#0B1F3A;
                  color:white;
                  text-decoration:none;
                  border-radius:8px;
                "
              >
                Şifremi Sıfırla
              </a>
            </p>

            <p>
              Bu bağlantı 30 dakika boyunca geçerlidir.
            </p>

            <p>
              Bu işlemi sen istemediysen bu e-postayı
              görmezden gelebilirsin.
            </p>
          </div>
        `
      });

    } catch (emailErr) {
      /*
        Mail gitmediyse oluşturduğumuz tokenı
        kullanılabilir halde bırakmıyoruz.
      */
      await query(
        `UPDATE yks2_users
         SET
           password_reset_token_hash = NULL,
           password_reset_expires_at = NULL,
           password_reset_last_sent_at = NULL,
           updated_at = NOW()
         WHERE id = $1`,
        [
          user.id
        ]
      );

      throw emailErr;
    }


    return res
      .status(200)
      .json(
        genericResponse
      );


  } catch (err) {
    console.error(
      'Forgot password error:',
      err
    );

    return res
      .status(500)
      .json({
        error:
          'Şifre sıfırlama isteği oluşturulamadı.'
      });
  }
}
