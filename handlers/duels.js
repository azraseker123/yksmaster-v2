import crypto from 'node:crypto';

import { requireUser } from '../lib/auth.js';

import {
  onlyMethods,
  text
} from '../lib/http.js';

import {
  query,
  db
} from '../lib/db.js';

import {
  turkeyDate,
  addDays
} from '../lib/dates.js';

function generateInviteCode() {
  return crypto
    .randomBytes(6)
    .toString('base64url')
    .toUpperCase();
}

async function createUniqueInviteCode(
  client
) {
  for (
    let attempt = 0;
    attempt < 5;
    attempt++
  ) {
    const invite =
      generateInviteCode();

    const exists =
      await client.query(
        `SELECT 1
         FROM yks2_duels
         WHERE invite_code = $1
         LIMIT 1`,
        [invite]
      );

    if (!exists.rows.length) {
      return invite;
    }
  }

  throw new Error(
    'Davet kodu oluşturulamadı.'
  );
}

async function score(
  userId,
  metric,
  start,
  end
) {
  if (!userId) {
    return 0;
  }

  if (metric === 'questions') {
    const result =
      await query(
        `SELECT
          COALESCE(
            SUM(
              correct_count +
              wrong_count +
              blank_count
            ),
            0
          )::int AS score
         FROM yks2_question_logs
         WHERE user_id = $1
           AND log_date
             BETWEEN $2 AND $3`,
        [
          userId,
          start,
          end
        ]
      );

    return Number(
      result.rows[0]?.score || 0
    );
  }

  const result =
    await query(
      `SELECT
        COALESCE(
          SUM(duration_minutes),
          0
        )::int AS score
       FROM yks2_study_sessions
       WHERE user_id = $1
         AND session_date
           BETWEEN $2 AND $3`,
      [
        userId,
        start,
        end
      ]
    );

  return Number(
    result.rows[0]?.score || 0
  );
}

export default async function handler(
  req,
  res
) {
  if (
    !onlyMethods(
      req,
      res,
      ['GET', 'POST']
    )
  ) {
    return;
  }

  res.setHeader(
    'Cache-Control',
    'no-store'
  );

  const user =
    await requireUser(
      req,
      res,
      { pro: true }
    );

  if (!user) return;

  try {
    if (req.method === 'GET') {
      const result =
        await query(
          `SELECT
            d.id,
            d.invite_code,
            d.owner_user_id,
            d.challenger_user_id,
            d.metric,
            d.title,
            d.starts_on::text,
            d.ends_on::text,
            d.created_at,
            u1.name AS owner_name,
            u2.name AS challenger_name
           FROM yks2_duels d
           JOIN yks2_users u1
             ON u1.id =
                d.owner_user_id
           LEFT JOIN yks2_users u2
             ON u2.id =
                d.challenger_user_id
           WHERE
             d.owner_user_id = $1
             OR
             d.challenger_user_id = $1
           ORDER BY
             d.created_at DESC
           LIMIT 60`,
          [user.id]
        );

      const today =
        turkeyDate();

      const items = [];

      for (
        const duel
        of result.rows
      ) {
        const [
          ownerScore,
          challengerScore
        ] =
          await Promise.all([
            score(
              duel.owner_user_id,
              duel.metric,
              duel.starts_on,
              duel.ends_on
            ),

            score(
              duel.challenger_user_id,
              duel.metric,
              duel.starts_on,
              duel.ends_on
            )
          ]);

        const finished =
          String(
            duel.ends_on
          ).slice(0, 10) <
          today;

        let status;

        if (
          !duel.challenger_user_id
        ) {
          status =
            finished
              ? 'expired'
              : 'waiting';

        } else {
          status =
            finished
              ? 'finished'
              : 'active';
        }

        let winner = null;

        if (
          status ===
            'finished' &&
          duel.challenger_user_id
        ) {
          if (
            ownerScore ===
            challengerScore
          ) {
            winner = 'draw';

          } else if (
            ownerScore >
            challengerScore
          ) {
            winner = 'owner';

          } else {
            winner =
              'challenger';
          }
        }

        items.push({
          ...duel,
          ownerScore,
          challengerScore,
          status,
          winner
        });
      }

      return res.status(200).json({
        items
      });
    }

    const action =
      text(
        req.body?.action,
        20
      );

    if (action === 'create') {
      const title =
        text(
          req.body?.title,
          120
        ) ||
        'Haftalık Düello';

      const metric =
        [
          'study_minutes',
          'questions'
        ].includes(
          req.body?.metric
        )
          ? req.body.metric
          : 'study_minutes';

      const start =
        turkeyDate();

      const end =
        addDays(
          start,
          6
        );

      const client =
        await db.connect();

      try {
        await client.query(
          'BEGIN'
        );

        const invite =
          await createUniqueInviteCode(
            client
          );

        const result =
          await client.query(
            `INSERT INTO yks2_duels(
              invite_code,
              owner_user_id,
              metric,
              title,
              starts_on,
              ends_on
            )
            VALUES(
              $1,$2,$3,$4,$5,$6
            )
            RETURNING
              id,
              invite_code,
              owner_user_id,
              challenger_user_id,
              metric,
              title,
              starts_on::text,
              ends_on::text,
              created_at`,
            [
              invite,
              user.id,
              metric,
              title,
              start,
              end
            ]
          );

        await client.query(
          'COMMIT'
        );

        return res
          .status(201)
          .json({
            item:
              result.rows[0]
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

    if (action === 'join') {
      const invite =
        text(
          req.body?.code,
          80
        ).toUpperCase();

      if (!invite) {
        return res.status(400).json({
          error:
            'Davet kodu gerekli.'
        });
      }

      const client =
        await db.connect();

      try {
        await client.query(
          'BEGIN'
        );

        const found =
          await client.query(
            `SELECT
              id,
              invite_code,
              owner_user_id,
              challenger_user_id,
              metric,
              title,
              starts_on::text,
              ends_on::text,
              created_at
             FROM yks2_duels
             WHERE invite_code = $1
             FOR UPDATE`,
            [invite]
          );

        const duel =
          found.rows[0];

        if (!duel) {
          await client.query(
            'ROLLBACK'
          );

          return res.status(404).json({
            error:
              'Düello bulunamadı.'
          });
        }

        if (
          Number(
            duel.owner_user_id
          ) ===
          Number(user.id)
        ) {
          await client.query(
            'ROLLBACK'
          );

          return res.status(400).json({
            error:
              'Kendi düellona katılamazsın.'
          });
        }

        if (
          duel.challenger_user_id
        ) {
          if (
            Number(
              duel.challenger_user_id
            ) ===
            Number(user.id)
          ) {
            await client.query(
              'COMMIT'
            );

            return res.status(200).json({
              item: duel
            });
          }

          await client.query(
            'ROLLBACK'
          );

          return res.status(409).json({
            error:
              'Bu düelloya başka biri katılmış.'
          });
        }

        const today =
          turkeyDate();

        if (
          String(
            duel.ends_on
          ).slice(0, 10) <
          today
        ) {
          await client.query(
            'ROLLBACK'
          );

          return res.status(410).json({
            error:
              'Bu düellonun süresi dolmuş.'
          });
        }

        const updated =
          await client.query(
            `UPDATE yks2_duels
             SET
               challenger_user_id = $1
             WHERE id = $2
               AND challenger_user_id
                   IS NULL
             RETURNING
               id,
               invite_code,
               owner_user_id,
               challenger_user_id,
               metric,
               title,
               starts_on::text,
               ends_on::text,
               created_at`,
            [
              user.id,
              duel.id
            ]
          );

        if (
          !updated.rows.length
        ) {
          await client.query(
            'ROLLBACK'
          );

          return res.status(409).json({
            error:
              'Bu düelloya başka biri katılmış.'
          });
        }

        await client.query(
          'COMMIT'
        );

        return res.status(200).json({
          item:
            updated.rows[0]
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
        'Geçersiz düello işlemi.'
    });

  } catch (err) {
    console.error(
      'Duels error:',
      err
    );

    return res.status(500).json({
      error:
        'Düello işlemi tamamlanamadı.'
    });
  }
}
