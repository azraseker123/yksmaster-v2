import bcrypt from 'bcryptjs';

import { requireUser } from '../../lib/auth.js';

import {
  query,
  db
} from '../../lib/db.js';

import {
  onlyMethods,
  text,
  int,
  publicUser,
  noStore
} from '../../lib/http.js';

const TRACKS = new Set([
  'sayisal',
  'esit_agirlik',
  'sozel'
]);

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

  const action =
    text(
      req.body?.action,
      20
    ) || 'profile';

  try {
    if (action === 'profile') {
      const name =
        text(
          req.body?.name,
          100
        );

      const track =
        text(
          req.body?.track,
          30
        );

      const city =
        text(
          req.body?.targetCity,
          100
        );

      const university =
        text(
          req.body?.targetUniversity,
          160
        );

      const department =
        text(
          req.body?.targetDepartment,
          160
        );

      const rank =
        int(
          req.body?.targetRank,
          1,
          5000000
        );

      if (
        !name ||
        !TRACKS.has(track) ||
        !city ||
        !department ||
        !rank
      ) {
        return res.status(400).json({
          error:
            'Profil alanlarını kontrol et.'
        });
      }

      const result =
        await query(
          `UPDATE yks2_users
           SET
             name = $1,
             track = $2,
             target_city = $3,
             target_university = $4,
             target_department = $5,
             target_rank = $6,
             updated_at = NOW()
           WHERE id = $7
           RETURNING
             id,
             name,
             email,
             track,
             target_city,
             target_university,
             target_department,
             target_rank,
             role,
             plan,
             plan_expires_at,
             created_at`,
          [
            name,
            track,
            city,
            university,
            department,
            rank,
            user.id
          ]
        );

      const updatedUser =
        result.rows[0];

      if (!updatedUser) {
        return res.status(404).json({
          error:
            'Hesap bulunamadı.'
        });
      }

      updatedUser.effectivePlan =
        user.effectivePlan;

      return res.status(200).json({
        user:
          publicUser(
            updatedUser
          )
      });
    }

    if (action === 'password') {
      const currentPassword =
        String(
          req.body?.currentPassword ||
          ''
        );

      const newPassword =
        String(
          req.body?.newPassword ||
          ''
        );

      if (
        !currentPassword ||
        currentPassword.length > 128
      ) {
        return res.status(400).json({
          error:
            'Mevcut şifre geçersiz.'
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

      const client =
        await db.connect();

      try {
        await client.query(
          'BEGIN'
        );

        const result =
          await client.query(
            `SELECT
              id,
              password_hash
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
              'Hesap bulunamadı.'
          });
        }

        const correct =
          await bcrypt.compare(
            currentPassword,
            account.password_hash
          );

        if (!correct) {
          await client.query(
            'ROLLBACK'
          );

          return res.status(401).json({
            error:
              'Mevcut şifre hatalı.'
          });
        }

        const samePassword =
          await bcrypt.compare(
            newPassword,
            account.password_hash
          );

        if (samePassword) {
          await client.query(
            'ROLLBACK'
          );

          return res.status(400).json({
            error:
              'Yeni şifre mevcut şifrenle aynı olamaz.'
          });
        }

        const passwordHash =
          await bcrypt.hash(
            newPassword,
            12
          );

        await client.query(
          `UPDATE yks2_users
           SET
             password_hash = $1,

             password_reset_token_hash =
               NULL,

             password_reset_expires_at =
               NULL,

             password_reset_last_sent_at =
               NULL,

             failed_login_count = 0,

             locked_until = NULL,

             session_version =
               session_version + 1,

             updated_at = NOW()

           WHERE id = $2`,
          [
            passwordHash,
            user.id
          ]
        );

        await client.query(
          'COMMIT'
        );

        return res.status(200).json({
          ok: true,
          logoutRequired: true
        });

      } catch (err) {
        await client
          .query('ROLLBACK')
          .catch(() => {});

        throw err;

      } finally {
        client.release();
      }
    }

    return res.status(400).json({
      error:
        'Geçersiz işlem.'
    });

  } catch (err) {
    console.error(
      'Profile update error:',
      err
    );

    return res.status(500).json({
      error:
        'Profil güncellenemedi.'
    });
  }
}
