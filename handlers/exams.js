import { requireUser } from '../lib/auth.js';

import {
  onlyMethods,
  text,
  dateOnly,
  int
} from '../lib/http.js';

import { query } from '../lib/db.js';
import { recordActivity } from '../lib/activity.js';
import { getCurriculumForField } from '../data/curriculum.js';

function calcNet(details) {
  let net = 0;

  for (const value of Object.values(details || {})) {
    if (
      value &&
      typeof value === 'object'
    ) {
      net +=
        Number(value.correct || 0) -
        Number(value.wrong || 0) / 4;
    }
  }

  return Number(
    net.toFixed(2)
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

  res.setHeader(
    'Cache-Control',
    'no-store'
  );

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
          exam_type,
          exam_name,
          exam_date::text,
          details,
          total_net,
          created_at
         FROM yks2_exam_results
         WHERE user_id = $1
         ORDER BY
           exam_date DESC,
           id DESC
         LIMIT 100`,
        [user.id]
      );

    return res.status(200).json({
      items: result.rows
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
          'Geçersiz deneme kaydı.'
      });
    }

    const result =
      await query(
        `DELETE FROM yks2_exam_results
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
          'Deneme kaydı bulunamadı.'
      });
    }

    return res.status(200).json({
      ok: true
    });
  }

  const examType =
    text(
      req.body?.examType,
      3
    ).toUpperCase();

  const examName =
    text(
      req.body?.examName,
      160
    );

  const examDate =
    dateOnly(
      req.body?.examDate
    );

  const details =
    req.body?.details &&
    typeof req.body.details === 'object' &&
    !Array.isArray(req.body.details)
      ? req.body.details
      : {};

  if (
    !['TYT', 'AYT'].includes(examType) ||
    !examName ||
    !examDate
  ) {
    return res.status(400).json({
      error:
        'Deneme bilgilerini kontrol et.'
    });
  }

  const curriculum =
    getCurriculumForField(
      user.track
    );

  const allowedSubjects =
    new Set(
      Object.keys(
        curriculum?.[examType] || {}
      )
    );

  const clean = {};

  for (
    const [subject, value]
    of Object.entries(details)
  ) {
    if (
      !allowedSubjects.has(subject) ||
      !value ||
      typeof value !== 'object' ||
      Array.isArray(value)
    ) {
      continue;
    }

    const correct =
      int(
        value.correct ?? 0,
        0,
        500
      );

    const wrong =
      int(
        value.wrong ?? 0,
        0,
        500
      );

    const blank =
      int(
        value.blank ?? 0,
        0,
        500
      );

    if (
      correct === null ||
      wrong === null ||
      blank === null
    ) {
      return res.status(400).json({
        error:
          `${subject} için doğru, yanlış ve boş değerleri geçersiz.`
      });
    }

    if (
      correct +
      wrong +
      blank >
      500
    ) {
      return res.status(400).json({
        error:
          `${subject} için toplam soru sayısı gerçekçi sınırın üzerinde.`
      });
    }

    clean[subject] = {
      correct,
      wrong,
      blank
    };
  }

  if (
    !Object.keys(clean).length
  ) {
    return res.status(400).json({
      error:
        'En az bir geçerli ders sonucu gir.'
    });
  }

  if (
    !Object.values(clean)
      .some(
        value =>
          value.correct +
          value.wrong +
          value.blank >
          0
      )
  ) {
    return res.status(400).json({
      error:
        'Denemede en az bir soru sonucu gir.'
    });
  }

  const totalNet =
    calcNet(clean);

  const result =
    await query(
      `INSERT INTO yks2_exam_results(
        user_id,
        exam_type,
        exam_name,
        exam_date,
        details,
        total_net
      )
      VALUES(
        $1,
        $2,
        $3,
        $4,
        $5::jsonb,
        $6
      )
      RETURNING
        id,
        exam_type,
        exam_name,
        exam_date::text,
        details,
        total_net,
        created_at`,
      [
        user.id,
        examType,
        examName,
        examDate,
        JSON.stringify(clean),
        totalNet
      ]
    );

  try {
    await recordActivity(
      user.id,
      'exam',
      {
        examType,
        totalNet
      },
      examDate
    );

  } catch (activityErr) {
    console.error(
      'Exam activity log error:',
      activityErr
    );
  }

  return res.status(201).json({
    item:
      result.rows[0]
  });
}
