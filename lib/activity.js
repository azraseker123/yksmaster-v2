import { query } from './db.js';
import { turkeyDate } from './dates.js';

const STREAK_ACTIVITY_TYPES = [
  'study',
  'questions',
  'exam'
];

export async function recordActivity(
  userId,
  type,
  metadata = {},
  activityDate = null
) {
  await query(
    `INSERT INTO yks2_activity_log(
      user_id,
      activity_type,
      activity_date,
      metadata
    )
    VALUES(
      $1,
      $2,
      COALESCE(
        $3::date,
        (
          NOW()
          AT TIME ZONE
          'Europe/Istanbul'
        )::date
      ),
      $4::jsonb
    )`,
    [
      userId,
      type,
      activityDate,
      JSON.stringify(
        metadata || {}
      )
    ]
  );
}

function toUtcDate(value) {
  return new Date(
    `${value}T12:00:00Z`
  );
}

function diffDays(
  newer,
  older
) {
  return Math.round(
    (
      toUtcDate(newer) -
      toUtcDate(older)
    ) /
    86400000
  );
}

export async function getStreak(
  userId
) {
  const today =
    turkeyDate();

  const result =
    await query(
      `SELECT DISTINCT
        activity_date::text AS date

       FROM yks2_activity_log

       WHERE user_id = $1

         AND activity_type =
           ANY($2::text[])

         AND activity_date <=
           $3::date

       ORDER BY
         date DESC

       LIMIT 400`,
      [
        userId,
        STREAK_ACTIVITY_TYPES,
        today
      ]
    );

  if (
    !result.rows.length
  ) {
    return {
      current: 0,
      longest: 0,
      lastActive: null
    };
  }

  const dates =
    result.rows.map(
      row =>
        row.date
    );

  /*
   * CURRENT STREAK
   *
   * Seri bugün aktifse bugün başlar.
   * Dün aktif olup bugün henüz çalışma
   * yapılmadıysa seri hâlâ devam ediyor.
   *
   * 2+ gün boşluk varsa current = 0.
   */
  let current = 0;

  const firstGap =
    diffDays(
      today,
      dates[0]
    );

  if (
    firstGap === 0 ||
    firstGap === 1
  ) {
    current = 1;

    for (
      let i = 1;
      i < dates.length;
      i++
    ) {
      const gap =
        diffDays(
          dates[i - 1],
          dates[i]
        );

      if (
        gap === 1
      ) {
        current++;
      } else {
        break;
      }
    }
  }

  /*
   * LONGEST STREAK
   */
  let longest =
    dates.length
      ? 1
      : 0;

  let run =
    dates.length
      ? 1
      : 0;

  for (
    let i = 1;
    i < dates.length;
    i++
  ) {
    const gap =
      diffDays(
        dates[i - 1],
        dates[i]
      );

    if (
      gap === 1
    ) {
      run++;

    } else {
      run = 1;
    }

    if (
      run > longest
    ) {
      longest =
        run;
    }
  }

  return {
    current,
    longest,
    lastActive:
      dates[0] ||
      null
  };
}
