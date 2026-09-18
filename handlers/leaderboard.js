import { requireUser } from '../lib/auth.js';

import {
  onlyMethods,
  noStore
} from '../lib/http.js';

import { query } from '../lib/db.js';

export default async function handler(
  req,
  res
) {
  if (
    !onlyMethods(
      req,
      res,
      ['GET']
    )
  ) {
    return;
  }

  noStore(res);

  const user =
    await requireUser(
      req,
      res,
      { pro: true }
    );

  if (!user) return;

  try {
    const peers =
      await query(
        `
        WITH peer_ids AS (
          SELECT
            $1::bigint AS id

          UNION

          SELECT
            CASE
              WHEN owner_user_id = $1
              THEN challenger_user_id
              ELSE owner_user_id
            END

          FROM yks2_duels

          WHERE
            (
              owner_user_id = $1
              OR
              challenger_user_id = $1
            )
            AND
            challenger_user_id
              IS NOT NULL
        )

        SELECT
          u.id,
          u.name

        FROM yks2_users u

        JOIN peer_ids p
          ON p.id = u.id

        WHERE
          p.id IS NOT NULL
        `,
        [user.id]
      );

    const ids =
      peers.rows.map(
        row =>
          Number(row.id)
      );

    if (!ids.length) {
      return res.status(200).json({
        items: []
      });
    }

    const [
      study,
      questions
    ] =
      await Promise.all([
        query(
          `
          SELECT
            user_id,

            COALESCE(
              SUM(duration_minutes),
              0
            )::int AS minutes

          FROM yks2_study_sessions

          WHERE
            user_id =
              ANY($1::bigint[])
            AND
            session_date
              BETWEEN
                date_trunc(
                  'week',
                  NOW()
                    AT TIME ZONE
                    'Europe/Istanbul'
                )::date
              AND
                (
                  date_trunc(
                    'week',
                    NOW()
                      AT TIME ZONE
                      'Europe/Istanbul'
                  )::date
                  + 6
                )

          GROUP BY
            user_id
          `,
          [ids]
        ),

        query(
          `
          SELECT
            user_id,

            COALESCE(
              SUM(
                correct_count +
                wrong_count +
                blank_count
              ),
              0
            )::int AS questions

          FROM yks2_question_logs

          WHERE
            user_id =
              ANY($1::bigint[])
            AND
            log_date
              BETWEEN
                date_trunc(
                  'week',
                  NOW()
                    AT TIME ZONE
                    'Europe/Istanbul'
                )::date
              AND
                (
                  date_trunc(
                    'week',
                    NOW()
                      AT TIME ZONE
                      'Europe/Istanbul'
                  )::date
                  + 6
                )

          GROUP BY
            user_id
          `,
          [ids]
        )
      ]);

    const studyMap =
      new Map(
        study.rows.map(
          row => [
            Number(row.user_id),
            Number(row.minutes)
          ]
        )
      );

    const questionMap =
      new Map(
        questions.rows.map(
          row => [
            Number(row.user_id),
            Number(row.questions)
          ]
        )
      );

    const items =
      peers.rows
        .map(
          row => {
            const id =
              Number(row.id);

            return {
              name:
                row.name,

              isMe:
                id ===
                Number(user.id),

              studyMinutes:
                studyMap.get(id) ||
                0,

              questions:
                questionMap.get(id) ||
                0
            };
          }
        )
        .sort(
          (a, b) =>
            b.studyMinutes -
              a.studyMinutes ||
            b.questions -
              a.questions ||
            a.name.localeCompare(
              b.name,
              'tr'
            )
        );

    return res.status(200).json({
      items
    });

  } catch (err) {
    console.error(
      'Leaderboard error:',
      err
    );

    return res.status(500).json({
      error:
        'Liderlik tablosu yüklenemedi.'
    });
  }
}
