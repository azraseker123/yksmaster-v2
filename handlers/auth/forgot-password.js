import crypto from 'crypto';
import { query } from '../../lib/db.js';
import { onlyMethods, text } from '../../lib/http.js';
import { sendEmail } from '../../lib/email.js';

export default async function handler(req, res) {
  if (!onlyMethods(req, res, ['POST'])) return;

  const email = text(req.body?.email, 200)?.toLowerCase();

  if (!email) {
    return res.status(400).json({
      error: 'E-posta adresini gir.'
    });
  }

  try {
    const result = await query(
      `SELECT id, name, email, password_reset_last_sent_at
       FROM yks2_users
       WHERE LOWER(email) = LOWER($1)
       LIMIT 1`,
      [email]
    );

    const user = result.rows[0];
const genericMessage =
  'Bu e-posta kayıtlıysa şifre sıfırlama bağlantısı gönderildi.';
    // Güvenlik için hesap var mı yok mu dışarı belli etmiyoruz.
   if (!user) {
  return res.status(200).json({
    ok: true,
    message: genericMessage
  });
}

if (
  user.password_reset_last_sent_at &&
  Date.now() -
    new Date(user.password_reset_last_sent_at).getTime()
    < 2 * 60 * 1000
) {
  return res.status(200).json({
    ok: true,
    message: genericMessage
  });
}

    const rawToken = crypto.randomBytes(32).toString('hex');

    const tokenHash = crypto
      .createHash('sha256')
      .update(rawToken)
      .digest('hex');

    await query(
      `UPDATE yks2_users
      SET
  password_reset_token_hash = $1,
  password_reset_expires_at = NOW() + INTERVAL '30 minutes',
  password_reset_last_sent_at = NOW()
WHERE id = $2
      [tokenHash, user.id]
    );

    const baseUrl =
      process.env.APP_URL ||
      'https://yksmaster-v.vercel.app';

    const resetUrl =
      `${baseUrl}/?resetToken=${encodeURIComponent(rawToken)}`;

    await sendEmail({
      to: user.email,
      subject: 'YKS Master 360 - Şifre Sıfırlama',
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.6">
          <h2>Şifreni sıfırla</h2>

         <p>Merhaba,</p>

          <p>
            YKS Master 360 hesabının şifresini sıfırlamak için
            aşağıdaki bağlantıya tıkla.
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
            Bu işlemi sen istemediysen bu e-postayı görmezden gelebilirsin.
          </p>
        </div>
      `
    });

   return res.status(200).json({
  ok: true,
  message: genericMessage
});

  } catch (err) {
    console.error('Forgot password error:', err);

    return res.status(500).json({
      error: 'Şifre sıfırlama isteği oluşturulamadı.'
    });
  }
}
