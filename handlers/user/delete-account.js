import bcrypt from 'bcryptjs';
import { requireUser, clearSessionCookie } from '../../lib/auth.js';
import { onlyMethods } from '../../lib/http.js';
import { db } from '../../lib/db.js';

export default async function handler(req, res) {
  if (!onlyMethods(req, res, ['POST'])) return;
  const user = await requireUser(req, res);
  if (!user) return;

  if (user.role === 'admin') {
    return res.status(403).json({ error: 'Admin/test hesabı uygulama içinden silinemez.' });
  }

  const password = String(req.body?.password || '');
  if (!password) return res.status(400).json({ error: 'Hesabı silmek için mevcut şifreni gir.' });

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const r = await client.query(
      `SELECT password_hash FROM yks2_users WHERE id=$1 FOR UPDATE`,
      [user.id]
    );
    if (!r.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
    }

    const valid = await bcrypt.compare(password, r.rows[0].password_hash);
    if (!valid) {
      await client.query('ROLLBACK');
      return res.status(401).json({ error: 'Şifre yanlış.' });
    }

    // User-owned rows are deleted by ON DELETE CASCADE. Used license codes keep
    // used_at populated, so they can never become reusable after account deletion.
    await client.query(`DELETE FROM yks2_users WHERE id=$1`, [user.id]);
    await client.query('COMMIT');
    res.setHeader('Set-Cookie', clearSessionCookie());
    return res.status(200).json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Delete account error:', err);
    return res.status(500).json({ error: 'Hesap silinemedi.' });
  } finally {
    client.release();
  }
}
