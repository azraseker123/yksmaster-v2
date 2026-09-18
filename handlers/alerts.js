import { requireUser } from '../lib/auth.js';

import {
  onlyMethods,
  noStore
} from '../lib/http.js';

import { query } from '../lib/db.js';
import { getSubjectPerformance } from '../lib/stats.js';
import { getStreak } from '../lib/activity.js';
import { turkeyDate } from '../lib/dates.js';

function toUTCDate(value) {
  return new Date(
    `${value}T12:00:00Z`
  );
}

function daysSince(
  today,
  value
) {
  if (!value) {
    return 999;
  }

  return Math.floor(
    (
      toUTCDate(today) -
      toUTCDate(value)
    ) /
    86400000
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
      { paid: true }
    );

  if (!user) return;

  try {
    const [
      lastStudy,
      review,
      todayPlan,
      lastExam,
      performance,
      streak
    ] =
      await Promise.all([
        query(
          `SELECT
            MAX(session_date)::text
              AS date
           FROM yks2_study_sessions
           WHERE user_id = $1`,
          [user.id]
        ),

        query(
          `SELECT
            COUNT(*)::int
              AS count
           FROM yks2_curriculum_progress
           WHERE user_id = $1
             AND review_needed = true`,
          [user.id]
        ),

        query(
          `SELECT
            COUNT(*)::int
              AS total,

            COUNT(*)
              FILTER (
                WHERE completed
              )::int
              AS done

           FROM yks2_daily_plans

           WHERE user_id = $1
             AND plan_date =
               (
                 NOW()
                 AT TIME ZONE
                 'Europe/Istanbul'
               )::date`,
          [user.id]
        ),

        query(
          `SELECT
            MAX(exam_date)::text
              AS date
           FROM yks2_exam_results
           WHERE user_id = $1`,
          [user.id]
        ),

        getSubjectPerformance(
          user.id
        ),

        getStreak(
          user.id
        )
      ]);

    const items = [];

    const today =
      turkeyDate();

    const lastStudyDate =
      lastStudy.rows[0]?.date;

    const lastExamDate =
      lastExam.rows[0]?.date;

    const reviewCount =
      Number(
        review.rows[0]?.count ||
        0
      );

    const planTotal =
      Number(
        todayPlan.rows[0]?.total ||
        0
      );

    const planDone =
      Number(
        todayPlan.rows[0]?.done ||
        0
      );

    if (
      daysSince(
        today,
        lastStudyDate
      ) >= 2
    ) {
      items.push({
        level:
          'warning',

        title:
          'Çalışma kaydı bekliyor',

        text:
          'Son 2 gündür çalışma süresi kaydı görünmüyor. Bugün kısa bir odak oturumu başlat.'
      });
    }

    if (
      reviewCount > 0
    ) {
      items.push({
        level:
          'info',

        title:
          'Tekrar listen hazır',

        text:
          `Tekrar bekleyen ${reviewCount} konun var. Bugünkü plana en az birini ekleyebilirsin.`
      });
    }

    const weak =
      [...performance]
        .filter(
          item =>
            Number(
              item.total ||
              0
            ) >= 20
        )
        .sort(
          (a, b) =>
            Number(
              a.successRate
            ) -
            Number(
              b.successRate
            )
        )[0];

    if (
      weak &&
      Number(
        weak.successRate
      ) < 65
    ) {
      items.push({
        level:
          'warning',

        title:
          `${weak.subject} dikkat istiyor`,

        text:
          `Kayıtlı sorularda başarı oranı %${weak.successRate}. Konu bazlı tekrar ve kısa test planla.`
      });
    }

    if (
      planTotal > 0 &&
      planDone <
        planTotal
    ) {
      items.push({
        level:
          'info',

        title:
          'Bugünün planı tamamlanmadı',

        text:
          `${planDone}/${planTotal} görev tamamlandı.`
      });
    }

    if (
      daysSince(
        today,
        lastExamDate
      ) >= 14
    ) {
      items.push({
        level:
          'info',

        title:
          'Deneme zamanı',

        text:
          'Son deneme kaydının üzerinden yaklaşık iki hafta geçti. Yeni bir deneme ile seviyeni ölç.'
      });
    }

    const currentStreak =
      Number(
        streak?.current ||
        0
      );

    if (
      currentStreak >= 3
    ) {
      items.push({
        level:
          'success',

        title:
          `🔥 ${currentStreak} günlük seri`,

        text:
          'Serin devam ediyor. Bugün en az bir gerçek çalışma aktivitesi kaydet.'
      });
    }

    if (
      !items.length
    ) {
      items.push({
        level:
          'success',

        title:
          'Her şey yolunda',

        text:
          'Yeni veriler girdikçe burada kişisel uyarılar oluşacak.'
      });
    }

    return res.status(200).json({
      items
    });

  } catch (err) {
    console.error(
      'Alerts error:',
      err
    );

    return res.status(500).json({
      error:
        'Uyarılar yüklenemedi.'
    });
  }
}
