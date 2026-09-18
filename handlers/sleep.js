import { requireUser } from '../lib/auth.js';

import {
  onlyMethods,
  text,
  int,
  dateOnly,
  noStore
} from '../lib/http.js';

import { query } from '../lib/db.js';

function timeToMinutes(value) {
  const [hours, minutes] =
    value
      .split(':')
      .map(Number);

  return (
    hours * 60 +
    minutes
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
      ['GET', 'POST', 'DELETE']
    )
  ) {
    return;
  }

  noStore(res);

  const user =
    await requireUser(
      req,
      res,
      { paid: true }
    );

  if (!user) return;

  if (req.method === 'GET') {
    const result =
      await query(
        `SELECT
          id,
          sleep_date::text,
          bedtime::text,
          wake_time::text,
          duration_minutes,
          quality
         FROM yks2_sleep_logs
         WHERE user_id = $1
         ORDER BY
           sleep_date DESC
         LIMIT 90`,
        [user.id]
      );

    return res.status(200).json({
      items:
        result.rows
    });
  }

  if (req.method === 'DELETE') {
    const id =
      int(
        req.query?.id,
        1,
        999999999999
      );

    if (!id) {
      return res.status(400).json({
        error:
          'Geçersiz uyku kaydı.'
      });
    }

    const result =
      await query(
        `DELETE FROM yks2_sleep_logs
         WHERE id = $1
           AND user_id = $2
         RETURNING id`,
        [
          id,
          user.id
        ]
      );

    if (!result.rows.length) {
      return res.status(404).json({
        error:
          'Uyku kaydı bulunamadı.'
      });
    }

    return res.status(200).json({
      ok: true
    });
  }

  const sleepDate =
    dateOnly(
      req.body?.sleepDate
    );

  const bedtime =
    text(
      req.body?.bedtime,
      5
    );

  const wakeTime =
    text(
      req.body?.wakeTime,
      5
    );

  const qualityRaw =
    req.body?.quality;

  const quality =
    qualityRaw === '' ||
    qualityRaw === null ||
    qualityRaw === undefined
      ? null
      : int(
          qualityRaw,
          1,
          5
        );

  if (!sleepDate) {
    return res.status(400).json({
      error:
        'Geçerli bir uyku tarihi gir.'
    });
  }

  const timePattern =
    /^([01]\d|2[0-3]):[0-5]\d$/;

  if (
    !timePattern.test(
      bedtime
    ) ||
    !timePattern.test(
      wakeTime
    )
  ) {
    return res.status(400).json({
      error:
        'Uyku saatlerini kontrol et.'
    });
  }

  if (
    qualityRaw !== '' &&
    qualityRaw !== null &&
    qualityRaw !== undefined &&
    quality === null
  ) {
    return res.status(400).json({
      error:
        'Uyku kalitesi 1 ile 5 arasında olmalı.'
    });
  }

  let duration =
    timeToMinutes(
      wakeTime
    ) -
    timeToMinutes(
      bedtime
    );

  if (duration <= 0) {
    duration += 1440;
  }

  if (
    duration < 1 ||
    duration > 1440
  ) {
    return res.status(400).json({
      error:
        'Uyku süresi geçersiz.'
    });
  }

  const result =
    await query(
      `INSERT INTO yks2_sleep_logs(
        user_id,
        sleep_date,
        bedtime,
        wake_time,
        duration_minutes,
        quality
      )
      VALUES(
        $1,$2,$3,$4,$5,$6
      )
      ON CONFLICT(
        user_id,
        sleep_date
      )
      DO UPDATE SET
        bedtime =
          EXCLUDED.bedtime,
        wake_time =
          EXCLUDED.wake_time,
        duration_minutes =
          EXCLUDED.duration_minutes,
        quality =
          EXCLUDED.quality
      RETURNING
        id,
        sleep_date::text,
        bedtime::text,
        wake_time::text,
        duration_minutes,
        quality`,
      [
        user.id,
        sleepDate,
        bedtime,
        wakeTime,
        duration,
        quality
      ]
    );

  return res.status(200).json({
    item:
      result.rows[0]
  });
}
