import crypto from 'crypto';
import { query } from '../../lib/db.js';
import { sendEmail } from '../../lib/email.js';
import { onlyMethods, normalizeEmail } from '../../lib/http.js';

export default async function handler(req, res) {
  if (!onlyMethods(req, res, ['POST'])) return;

  const email = normalizeEmail(req.body?.email);

  const genericResponse = {
    ok: true,
    message:
      'Eğer bu e-posta adresiyle doğrulanmamış bir hesap varsa yeni doğrulama bağlantısı gönderildi.'
  };

  if (!email) {
    return res.status(200).json(genericResponse);
  }

  try {
    const result = await query(
      `SELECT
         id,
         email,
       email_verified_at,
email_verify_expires_at,
email_verify_last_sent_at
       FROM yks2_users
       WHERE email = $1
       LIMIT 1`,
      [email]
    );

    const user = result.rows[0];

    if (!user || user.email_verified_at) {
      return res.status(200).json(genericResponse);
    }
if (
  user.email_verify_last_sent_at &&
  Date.now() -
    new Date(user.email_verify_last_sent_at).getTime()
    < 2 * 60 * 1000
) {
  return res.status(200).json(genericResponse);
}
    const rawVerifyToken =
      crypto.randomBytes(32).toString('hex');

    const verifyTokenHash = crypto
      .createHash('sha256')
      .update(rawVerifyToken)
      .digest('hex');

    await query(
      `UPDATE yks2_users
       SET
         email_verify_token_hash = $1,
         email_verify_expires_at =
           NOW() + INTERVAL '24 hours',
         updated_at = NOW()
       WHERE id = $2`,
      [verifyTokenHash, user.id]
    );

    const baseUrl =
      process.env.APP_URL ||
      'https://yksmaster-v.vercel.app';

    const verifyUrl =
      `${baseUrl}/?verifyEmailToken=${encodeURIComponent(rawVerifyToken)}`;

    try {
      await sendEmail({
        to: user.email,
        subject:
          'YKS Master 360 - E-posta Doğrulama',
        html: `
          <div style="font-family:Arial,sans-serif;line-height:1.6">
            <h2>E-posta adresini doğrula</h2>

            <p>
              YKS Master 360 hesabını doğrulamak için
              aşağıdaki butona tıkla.
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
          </div>
        `
      });
    } catch (emailErr) {
      await query(
        `UPDATE yks2_users
         SET
           email_verify_token_hash = NULL,
           email_verify_expires_at = NULL,
           updated_at = NOW()
         WHERE id = $1`,
        [user.id]
      );

      throw emailErr;
    }

    return res.status(200).json(genericResponse);

  } catch (err) {
    console.error(
      'Resend verification error:',
      err
    );

    return res.status(500).json({
      error:
        'Doğrulama e-postası şu anda gönderilemedi.'
    });
  }
}
