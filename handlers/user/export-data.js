import { requireUser } from '../../lib/auth.js';

import {
  onlyMethods,
  publicUser,
  noStore
} from '../../lib/http.js';

import { query } from '../../lib/db.js';

const TABLES = {
  curriculum:
    'yks2_curriculum_progress',

  planner:
    'yks2_daily_plans',

  exams:
    'yks2_exam_results',

  resources:
    'yks2_resources',

  questions:
    'yks2_question_logs',

  study:
    'yks2_study_sessions',

  sleep:
    'yks2_sleep_logs',

  mistakeArchive:
    'yks2_mistake_archive',

  badges:
    'yks2_user_badges',

  aiUsage:
    'yks2_ai_usage',

  activity:
    'yks2_activity_log'
};

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
      res
    );

  if (!user) return;

  try {
    const entries =
      await Promise.all(
        Object.entries(TABLES)
          .map(
            async (
              [key, table]
            ) => {
              /*
               * Yanlış arşivi fotoğraflarının
               * base64 verisini bu JSON'a
               * gömmüyoruz.
               *
               * Görsel metadatası exportta kalır.
               * Görseller hesap açıkken
               * authenticated archive endpointi
               * üzerinden korunmaya devam eder.
               */
              const select =
                table ===
                'yks2_mistake_archive'
                  ? `
                    SELECT
                      id,
                      exam,
                      subject,
                      topic,
                      source_name,
                      note,
                      mime_type,
                      favorite,
                      resolved,
                      created_at
                    FROM ${table}
                    WHERE user_id = $1
                    ORDER BY id
                  `
                  : `
                    SELECT *
                    FROM ${table}
                    WHERE user_id = $1
                    ORDER BY id
                  `;

              const result =
                await query(
                  select,
                  [user.id]
                );

              return [
                key,
                result.rows
              ];
            }
          )
      );

    /*
     * Abonelik geçmişi de kullanıcı verisinin
     * parçası olduğu için exporta ekleniyor.
     */
    const subscriptionResult =
      await query(
        `SELECT
          id,
          package_key,
          previous_plan,
          new_plan,
          previous_expires_at,
          starts_at,
          expires_at,
          activation_type,
          created_at
         FROM yks2_subscription_events
         WHERE user_id = $1
         ORDER BY id`,
        [user.id]
      );

    /*
     * Düello kayıtlarında user_id isimli tek
     * kolon olmadığı için ayrıca sorguluyoruz.
     * Yalnızca kullanıcının taraf olduğu
     * düellolar export edilir.
     */
    const duelsResult =
      await query(
        `SELECT
          id,
          owner_user_id,
          challenger_user_id,
          metric,
          title,
          starts_on,
          ends_on,
          created_at
         FROM yks2_duels
         WHERE
           owner_user_id = $1
           OR challenger_user_id = $1
         ORDER BY id`,
        [user.id]
      );

    const payload = {
      exportedAt:
        new Date().toISOString(),

      product:
        'YKS Master 360',

      user:
        publicUser(user),

      data: {
        ...Object.fromEntries(
          entries
        ),

        subscriptionHistory:
          subscriptionResult.rows,

        duels:
          duelsResult.rows
      }
    };

    const date =
      new Date()
        .toISOString()
        .slice(0, 10);

    res.setHeader(
      'Content-Type',
      'application/json; charset=utf-8'
    );

    res.setHeader(
      'Content-Disposition',
      `attachment; filename="yks-master-verilerim-${date}.json"`
    );

    res.setHeader(
      'X-Content-Type-Options',
      'nosniff'
    );

    return res
      .status(200)
      .send(
        JSON.stringify(
          payload,
          null,
          2
        )
      );

  } catch (err) {
    console.error(
      'Data export error:',
      err
    );

    return res.status(500).json({
      error:
        'Veri dışa aktarma tamamlanamadı.'
    });
  }
}
