import { requireUser } from '../../lib/auth.js';
import { onlyMethods, publicUser } from '../../lib/http.js';
import { query } from '../../lib/db.js';

const TABLES = {
  curriculum: 'yks2_curriculum_progress',
  planner: 'yks2_daily_plans',
  exams: 'yks2_exam_results',
  resources: 'yks2_resources',
  questions: 'yks2_question_logs',
  study: 'yks2_study_sessions',
  sleep: 'yks2_sleep_logs',
  mistakeArchive: 'yks2_mistake_archive',
  badges: 'yks2_user_badges',
  aiUsage: 'yks2_ai_usage',
  activity: 'yks2_activity_log'
};

export default async function handler(req, res) {
  if (!onlyMethods(req, res, ['GET'])) return;
  const user = await requireUser(req, res);
  if (!user) return;

  try {
    const entries = await Promise.all(Object.entries(TABLES).map(async ([key, table]) => {
      // The archive export intentionally excludes image_data so one export cannot
      // accidentally create a huge JSON file. Metadata remains in the export and
      // photos stay available from the authenticated archive while the account exists.
      const select = table === 'yks2_mistake_archive'
        ? `SELECT id,exam,subject,topic,source_name,note,mime_type,favorite,resolved,created_at FROM ${table} WHERE user_id=$1 ORDER BY id`
        : `SELECT * FROM ${table} WHERE user_id=$1 ORDER BY id`;
      const r = await query(select, [user.id]);
      return [key, r.rows];
    }));

    const payload = {
      exportedAt: new Date().toISOString(),
      product: 'YKS Master V2',
      user: publicUser(user),
      data: Object.fromEntries(entries)
    };

    const date = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="yks-master-verilerim-${date}.json"`);
    return res.status(200).send(JSON.stringify(payload, null, 2));
  } catch (err) {
    console.error('Data export error:', err);
    return res.status(500).json({ error: 'Veri dışa aktarma tamamlanamadı.' });
  }
}
