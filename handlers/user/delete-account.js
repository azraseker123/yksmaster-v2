import bcrypt from 'bcryptjs';

import {
  requireUser,
  clearSessionCookie
} from '../../lib/auth.js';

import {
  onlyMethods,
  noStore
} from '../../lib/http.js';

import { db } from '../../lib/db.js';

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

  const user =
    await requireUser(
      req,
      res
    );

  if (!user) return;

  /*
   * Admin/test hesabının yanlışlıkla
   * uygulama içinden silinmesini engelle.
   */
  if (
    user.role === 'admin'
  ) {
    return res.status(403).json({
      error:
        'Admin/test hesabı uygulama içinden silinemez.'
    });
  }

  const password =
    String(
      req.body?.password ||
      ''
    );

  if (
    !password ||
    password.length > 128
  ) {
    return res.status(400).json({
      error:
        'Hesabı silmek için geçerli mevcut şifreni gir.'
    });
  }

  const client =
    await db.connect();

  try {
    await client.query(
      'BEGIN'
    );

    /*
     * Hesabı kilitle.
     *
     * Böylece aynı hesap üzerinde aynı anda
     * şifre değiştirme / silme gibi işlemler
     * çakışmaz.
     */
    const result =
      await client.query(
        `SELECT
          id,
          password_hash,
          role
         FROM yks2_users
         WHERE id = $1
         FOR UPDATE`,
        [user.id]
      );

    const account =
      result.rows[0];

    if (!account) {
      await client.query(
        'ROLLBACK'
      );

      return res.status(404).json({
        error:
          'Kullanıcı bulunamadı.'
      });
    }

    /*
     * Rolü transaction içindeki güncel
     * DB kaydından tekrar kontrol et.
     */
    if (
      account.role === 'admin'
    ) {
      await client.query(
        'ROLLBACK'
      );

      return res.status(403).json({
        error:
          'Admin/test hesabı uygulama içinden silinemez.'
      });
    }

    const valid =
      await bcrypt.compare(
        password,
        account.password_hash
      );

    if (!valid) {
      await client.query(
        'ROLLBACK'
      );

      return res.status(401).json({
        error:
          'Şifre yanlış.'
      });
    }

    /*
     * İlişkili tabloların silinme davranışı
     * SQL foreign key tanımlarına bağlıdır.
     *
     * Şema kontrolünde ON DELETE CASCADE /
     * SET NULL davranışlarını ayrıca
     * doğrulayacağız.
     */
    const deleted =
      await client.query(
        `DELETE FROM yks2_users
         WHERE id = $1
         RETURNING id`,
        [user.id]
      );

    if (!deleted.rows.length) {
      await client.query(
        'ROLLBACK'
      );

      return res.status(404).json({
        error:
          'Kullanıcı bulunamadı.'
      });
    }

    await client.query(
      'COMMIT'
    );

    res.setHeader(
      'Set-Cookie',
      clearSessionCookie()
    );

    return res.status(200).json({
      ok: true
    });

  } catch (err) {
    await client
      .query('ROLLBACK')
      .catch(() => {});

    console.error(
      'Delete account error:',
      err
    );

    return res.status(500).json({
      error:
        'Hesap silinemedi.'
    });

  } finally {
    client.release();
  }
}
