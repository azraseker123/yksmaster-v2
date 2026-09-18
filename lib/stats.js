import { query } from './db.js';
import { getStreak } from './activity.js';

export async function getQuestionTotals(
  userId
) {
  const result =
    await query(
      `SELECT
        COALESCE(
          SUM(correct_count),
          0
        )::int AS correct,

        COALESCE(
          SUM(wrong_count),
          0
        )::int AS wrong,

        COALESCE(
          SUM(blank_count),
          0
        )::int AS blank

       FROM yks2_question_logs

       WHERE user_id = $1`,
      [userId]
    );

  const row =
    result.rows[0] || {};

  const correct =
    Number(
      row.correct || 0
    );

  const wrong =
    Number(
      row.wrong || 0
    );

  const blank =
    Number(
      row.blank || 0
    );

  return {
    correct,
    wrong,
    blank,
    total:
      correct +
      wrong +
      blank
  };
}

export async function getStudySummary(
  userId
) {
  const result =
    await query(
      `SELECT
        COALESCE(
          SUM(duration_minutes)
          FILTER (
            WHERE session_date =
              (
                NOW()
                AT TIME ZONE
                'Europe/Istanbul'
              )::date
          ),
          0
        )::int
          AS today_minutes,

        COALESCE(
          SUM(duration_minutes)
          FILTER (
            WHERE session_date >=
              (
                NOW()
                AT TIME ZONE
                'Europe/Istanbul'
              )::date
              - INTERVAL '6 days'
          ),
          0
        )::int
          AS week_minutes,

        COALESCE(
          SUM(duration_minutes),
          0
        )::int
          AS total_minutes

       FROM yks2_study_sessions

       WHERE user_id = $1`,
      [userId]
    );

  const row =
    result.rows[0] || {};

  return {
    today_minutes:
      Number(
        row.today_minutes ||
        0
      ),

    week_minutes:
      Number(
        row.week_minutes ||
        0
      ),

    total_minutes:
      Number(
        row.total_minutes ||
        0
      )
  };
}

export async function getSubjectPerformance(
  userId
) {
  const result =
    await query(
      `SELECT
        exam,
        subject,

        COALESCE(
          SUM(correct_count),
          0
        )::int AS correct,

        COALESCE(
          SUM(wrong_count),
          0
        )::int AS wrong,

        COALESCE(
          SUM(blank_count),
          0
        )::int AS blank,

        COUNT(*)::int
          AS sessions

       FROM yks2_question_logs

       WHERE user_id = $1

       GROUP BY
         exam,
         subject

       ORDER BY
         exam,
         subject`,
      [userId]
    );

  return result.rows.map(
    row => {
      const correct =
        Number(
          row.correct || 0
        );

      const wrong =
        Number(
          row.wrong || 0
        );

      const blank =
        Number(
          row.blank || 0
        );

      const sessions =
        Number(
          row.sessions || 0
        );

      const attempted =
        correct +
        wrong;

      return {
        exam:
          row.exam,

        subject:
          row.subject,

        correct,
        wrong,
        blank,
        sessions,

        total:
          correct +
          wrong +
          blank,

        successRate:
          attempted > 0
            ? Math.round(
                correct /
                attempted *
                100
              )
            : 0
      };
    }
  );
}

export async function curriculumPercentages(
  userId,
  curriculum
) {
  const result =
    await query(
      `SELECT
        exam,
        subject,
        topic_id,
        completed

       FROM yks2_curriculum_progress

       WHERE user_id = $1`,
      [userId]
    );

  const completed =
    new Set(
      result.rows
        .filter(
          row =>
            row.completed
        )
        .map(
          row =>
            `${row.exam}|${row.subject}|${row.topic_id}`
        )
    );

  const output = {
    TYT: {
      overall: 0,
      subjects: {}
    },

    AYT: {
      overall: 0,
      subjects: {}
    }
  };

  let totalTopics = 0;
  let totalCompleted = 0;

  for (
    const exam
    of ['TYT', 'AYT']
  ) {
    let examTopics = 0;
    let examCompleted = 0;

    for (
      const [
        subject,
        topics
      ]
      of Object.entries(
        curriculum?.[exam] ||
        {}
      )
    ) {
      const done =
        topics.filter(
          topic =>
            completed.has(
              `${exam}|${subject}|${topic.id}`
            )
        ).length;

      output[exam]
        .subjects[subject] =
          topics.length
            ? Math.round(
                done /
                topics.length *
                100
              )
            : 0;

      examCompleted += done;
      examTopics +=
        topics.length;
    }

    output[exam].overall =
      examTopics
        ? Math.round(
            examCompleted /
            examTopics *
            100
          )
        : 0;

    totalCompleted +=
      examCompleted;

    totalTopics +=
      examTopics;
  }

  output.overall =
    totalTopics
      ? Math.round(
          totalCompleted /
          totalTopics *
          100
        )
      : 0;

  return output;
}

export const BADGE_DEFS = [
  {
    key:
      'first_step',

    icon:
      '✦',

    label:
      'İlk Adım',

    description:
      'İlk çalışma oturumunu kaydet.'
  },

  {
    key:
      'streak_3',

    icon:
      '🔥',

    label:
      'Isınma Turu',

    description:
      '3 günlük çalışma serisine ulaş.'
  },

  {
    key:
      'streak_7',

    icon:
      '🔥',

    label:
      '7 Gün Ateş',

    description:
      '7 günlük çalışma serisine ulaş.'
  },

  {
    key:
      'questions_250',

    icon:
      '✎',

    label:
      '250 Soru',

    description:
      'Toplam 250 soru kaydet.'
  },

  {
    key:
      'questions_1000',

    icon:
      '🎯',

    label:
      '1000 Soru',

    description:
      'Toplam 1000 soru kaydet.'
  },

  {
    key:
      'resource_finish',

    icon:
      '📚',

    label:
      'Kaynak Avcısı',

    description:
      'Bir kaynağı tamamla.'
  },

  {
    key:
      'review_clear',

    icon:
      '↻',

    label:
      'Tekrar Ustası',

    description:
      'Tekrar listesinden 10 farklı konuyu gerçekten tamamla.'
  },

  {
    key:
      'tyt_master',

    icon:
      '🏅',

    label:
      'TYT Ustası',

    description:
      'TYT müfredatını %100 tamamla.'
  },

  {
    key:
      'ayt_master',

    icon:
      '🏆',

    label:
      'AYT Ustası',

    description:
      'Alanına ait AYT müfredatını %100 tamamla.'
  }
];

export async function evaluateBadges(
  userId,
  curriculumProgress
) {
  const [
    study,
    questions,
    resources,
    reviews,
    streak
  ] =
    await Promise.all([
      query(
        `SELECT
          COUNT(*)::int
            AS count

         FROM yks2_study_sessions

         WHERE user_id = $1`,
        [userId]
      ),

      getQuestionTotals(
        userId
      ),

      query(
        `SELECT
          COUNT(*)::int
            AS count

         FROM yks2_resources

         WHERE user_id = $1
           AND completed = true`,
        [userId]
      ),

      /*
       * Aynı konunun tekrar tekrar tamamlanması
       * rozeti yapay şekilde ilerletmesin.
       *
       * exam + subject + topicId kombinasyonunda
       * yalnızca farklı konuları sayıyoruz.
       */
      query(
        `SELECT
          COUNT(
            DISTINCT (
              metadata ->> 'exam',
              metadata ->> 'subject',
              metadata ->> 'topicId'
            )
          )::int AS count

         FROM yks2_activity_log

         WHERE user_id = $1
           AND activity_type =
             'review_completed'

           AND metadata ->> 'exam'
             IS NOT NULL

           AND metadata ->> 'subject'
             IS NOT NULL

           AND metadata ->> 'topicId'
             IS NOT NULL`,
        [userId]
      ),

      getStreak(
        userId
      )
    ]);

  const studyCount =
    Number(
      study.rows[0]?.count ||
      0
    );

  const completedResources =
    Number(
      resources.rows[0]?.count ||
      0
    );

  const completedReviews =
    Number(
      reviews.rows[0]?.count ||
      0
    );

  const currentStreak =
    Number(
      streak?.current ||
      0
    );

  const should =
    new Set();

  if (
    studyCount > 0
  ) {
    should.add(
      'first_step'
    );
  }

  if (
    currentStreak >= 3
  ) {
    should.add(
      'streak_3'
    );
  }

  if (
    currentStreak >= 7
  ) {
    should.add(
      'streak_7'
    );
  }

  if (
    questions.total >= 250
  ) {
    should.add(
      'questions_250'
    );
  }

  if (
    questions.total >= 1000
  ) {
    should.add(
      'questions_1000'
    );
  }

  if (
    completedResources > 0
  ) {
    should.add(
      'resource_finish'
    );
  }

  if (
    completedReviews >= 10
  ) {
    should.add(
      'review_clear'
    );
  }

  if (
    curriculumProgress
      ?.TYT
      ?.overall === 100
  ) {
    should.add(
      'tyt_master'
    );
  }

  if (
    curriculumProgress
      ?.AYT
      ?.overall === 100
  ) {
    should.add(
      'ayt_master'
    );
  }

  /*
   * UNIQUE(user_id, badge_key) olduğu için
   * aynı rozet paralel isteklerde bile
   * iki kere oluşturulamaz.
   */
  for (
    const key
    of should
  ) {
    await query(
      `INSERT INTO yks2_user_badges(
        user_id,
        badge_key
      )
      VALUES(
        $1,
        $2
      )
      ON CONFLICT(
        user_id,
        badge_key
      )
      DO NOTHING`,
      [
        userId,
        key
      ]
    );
  }

  const earnedResult =
    await query(
      `SELECT
        badge_key,
        earned_at

       FROM yks2_user_badges

       WHERE user_id = $1`,
      [userId]
    );

  const earnedMap =
    new Map(
      earnedResult.rows.map(
        row => [
          row.badge_key,
          row.earned_at
        ]
      )
    );

  return BADGE_DEFS.map(
    badge => ({
      ...badge,

      earned:
        earnedMap.has(
          badge.key
        ),

      earnedAt:
        earnedMap.get(
          badge.key
        ) ||
        null
    })
  );
}
