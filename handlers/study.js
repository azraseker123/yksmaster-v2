import { requireUser } from '../lib/auth.js';

import {
  onlyMethods,
  text,
  int,
  dateOnly
} from '../lib/http.js';

import { query } from '../lib/db.js';
import { recordActivity } from '../lib/activity.js';
import { turkeyDate } from '../lib/dates.js';
import { getCurriculumForField } from '../data/curriculum.js';


function normalizeLabel(
  value
) {
  return String(
    value || ''
  )
    .toLocaleLowerCase(
      'tr-TR'
    )
    .replace(
      /[’'"]/g,
      ''
    )
    .replace(
      /[(){}\[\].,:;!?/\\|_-]/g,
      ' '
    )
    .replace(
      /\s+/g,
      ' '
    )
    .trim();
}


function findCanonicalSubject(
  track,
  subject
) {
  if (!subject) {
    return '';
  }

  const curriculum =
    getCurriculumForField(
      track
    );

  const wanted =
    normalizeLabel(
      subject
    );

  const subjects =
    new Set([
      ...Object.keys(
        curriculum?.TYT || {}
      ),
      ...Object.keys(
        curriculum?.AYT || {}
      )
    ]);


  for (
    const candidate
    of subjects
  ) {
    if (
      normalizeLabel(
        candidate
      ) === wanted
    ) {
      return candidate;
    }
  }


  return null;
}


function findCanonicalTopic(
  track,
  subject,
  topic
) {
  if (!topic) {
    return '';
  }

  if (!subject) {
    return null;
  }

  const curriculum =
    getCurriculumForField(
      track
    );


  const topics = [
    ...(
      curriculum?.TYT?.[
        subject
      ] || []
    ),

    ...(
      curriculum?.AYT?.[
        subject
      ] || []
    )
  ];


  const wanted =
    normalizeLabel(
      topic
    );


  const exact =
    topics.find(
      item =>
        normalizeLabel(
          item?.name
        ) === wanted
    );


  if (exact) {
    return exact.name;
  }


  /*
    Çok küçük yazım farklarında yalnızca
    tek açık eşleşme varsa kabul et.

    Örneğin:
    "temel kavramlar"
    "Temel Kavramlar"
  */
  const possible =
    topics.filter(
      item => {
        const official =
          normalizeLabel(
            item?.name
          );

        if (
          official.length < 4 ||
          wanted.length < 4
        ) {
          return false;
        }

        return (
          official.includes(
            wanted
          ) ||
          wanted.includes(
            official
          )
        );
      }
    );


  if (
    possible.length === 1
  ) {
    return possible[0].name;
  }


  return null;
}


export default async function handler(
  req,
  res
) {
  if (
    !onlyMethods(
      req,
      res,
      [
        'GET',
        'POST',
        'DELETE'
      ]
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
      {
        paid: true
      }
    );


  if (!user) {
    return;
  }


  /*
    ÇALIŞMA KAYITLARINI GETİR
  */
  if (
    req.method === 'GET'
  ) {
    const result =
      await query(
        `
        SELECT
          id,
          session_date::text,
          subject,
          topic,
          duration_minutes,
          source,
          created_at

        FROM yks2_study_sessions

        WHERE user_id = $1

        ORDER BY
          session_date DESC,
          id DESC

        LIMIT 200
        `,
        [
          user.id
        ]
      );


    return res
      .status(200)
      .json({
        items:
          result.rows
      });
  }


  /*
    ÇALIŞMA KAYDI SİL
  */
  if (
    req.method === 'DELETE'
  ) {
    const id =
      int(
        req.query?.id,
        1,
        999999999999
      );


    if (!id) {
      return res
        .status(400)
        .json({
          error:
            'Geçersiz çalışma kaydı.'
        });
    }


    const result =
      await query(
        `
        DELETE FROM yks2_study_sessions

        WHERE id = $1
          AND user_id = $2

        RETURNING id
        `,
        [
          id,
          user.id
        ]
      );


    if (
      !result.rows.length
    ) {
      return res
        .status(404)
        .json({
          error:
            'Çalışma kaydı bulunamadı.'
        });
    }


    return res
      .status(200)
      .json({
        ok: true
      });
  }


  /*
    YENİ ÇALIŞMA KAYDI
  */
  const sessionDate =
    dateOnly(
      req.body?.sessionDate
    ) ||
    turkeyDate();


  const rawSubject =
    text(
      req.body?.subject,
      100
    );


  const rawTopic =
    text(
      req.body?.topic,
      180
    );


  const durationMinutes =
    int(
      req.body?.durationMinutes,
      1,
      1440
    );


  const source =
    req.body?.source ===
      'pomodoro'
      ? 'pomodoro'
      : 'manual';


  if (
    !durationMinutes
  ) {
    return res
      .status(400)
      .json({
        error:
          'Geçerli çalışma süresi gir.'
      });
  }


  /*
    Ders adını müfredattaki resmî
    ders adına dönüştür.

    Örneğin büyük/küçük harf farkı
    kayıt işlemini bozmaz.
  */
  const subject =
    findCanonicalSubject(
      user.track,
      rawSubject
    );


  if (
    rawSubject &&
    !subject
  ) {
    return res
      .status(400)
      .json({
        error:
          'Alanına uygun geçerli bir YKS dersi seç.'
      });
  }


  /*
    Konu girilmişse, ders seçilmiş
    olması gerekir.
  */
  if (
    rawTopic &&
    !subject
  ) {
    return res
      .status(400)
      .json({
        error:
          'Konu girmek için önce ders seç.'
      });
  }


  /*
    Konuyu da müfredattaki resmî
    konu adına dönüştür.

    Böylece:
    "temel kavramlar"
    "Temel Kavramlar"

    aynı konu olarak kabul edilir.
  */
  const topic =
    findCanonicalTopic(
      user.track,
      subject,
      rawTopic
    );


  if (
    rawTopic &&
    !topic
  ) {
    return res
      .status(400)
      .json({
        error:
          'Seçilen konu müfredat listesinde bulunmuyor.'
      });
  }


  const result =
    await query(
      `
      INSERT INTO
        yks2_study_sessions(
          user_id,
          session_date,
          subject,
          topic,
          duration_minutes,
          source
        )

      VALUES(
        $1,
        $2,
        $3,
        $4,
        $5,
        $6
      )

      RETURNING
        id,
        session_date::text,
        subject,
        topic,
        duration_minutes,
        source,
        created_at
      `,
      [
        user.id,
        sessionDate,
        subject || '',
        topic || '',
        durationMinutes,
        source
      ]
    );


  try {
    await recordActivity(
      user.id,
      'study',
      {
        subject:
          subject || '',

        topic:
          topic || '',

        minutes:
          durationMinutes,

        source
      },
      sessionDate
    );

  } catch (
    activityErr
  ) {
    console.error(
      'Study activity log error:',
      activityErr
    );
  }


  return res
    .status(201)
    .json({
      item:
        result.rows[0]
    });
}
