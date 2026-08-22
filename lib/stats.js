import { query } from './db.js';
import { getStreak } from './activity.js';

export async function getQuestionTotals(userId) {
  const r = await query(`SELECT
    COALESCE(SUM(correct_count),0)::int AS correct,
    COALESCE(SUM(wrong_count),0)::int AS wrong,
    COALESCE(SUM(blank_count),0)::int AS blank
    FROM yks2_question_logs WHERE user_id=$1`, [userId]);
  const x = r.rows[0];
  return { correct:x.correct, wrong:x.wrong, blank:x.blank, total:x.correct+x.wrong+x.blank };
}

export async function getStudySummary(userId) {
  const r = await query(`SELECT
    COALESCE(SUM(duration_minutes) FILTER (WHERE session_date=(NOW() AT TIME ZONE 'Europe/Istanbul')::date),0)::int AS today_minutes,
    COALESCE(SUM(duration_minutes) FILTER (WHERE session_date>=(NOW() AT TIME ZONE 'Europe/Istanbul')::date-INTERVAL '6 days'),0)::int AS week_minutes,
    COALESCE(SUM(duration_minutes),0)::int AS total_minutes
    FROM yks2_study_sessions WHERE user_id=$1`, [userId]);
  return r.rows[0];
}

export async function getSubjectPerformance(userId) {
  const r = await query(`SELECT exam,subject,
    SUM(correct_count)::int AS correct,
    SUM(wrong_count)::int AS wrong,
    SUM(blank_count)::int AS blank,
    COUNT(*)::int AS sessions
    FROM yks2_question_logs WHERE user_id=$1 GROUP BY exam,subject ORDER BY exam,subject`, [userId]);
  return r.rows.map(x => {
    const attempted=x.correct+x.wrong;
    return {...x,total:x.correct+x.wrong+x.blank,successRate:attempted?Math.round(x.correct/attempted*100):0};
  });
}

export async function curriculumPercentages(userId, curriculum) {
  const r = await query(`SELECT exam,subject,topic_id,completed FROM yks2_curriculum_progress WHERE user_id=$1`,[userId]);
  const completed = new Set(r.rows.filter(x=>x.completed).map(x=>`${x.exam}|${x.subject}|${x.topic_id}`));
  const out={TYT:{overall:0,subjects:{}},AYT:{overall:0,subjects:{}}};
  for (const exam of ['TYT','AYT']) {
    let doneAll=0,totalAll=0;
    for (const [subject,topics] of Object.entries(curriculum[exam]||{})) {
      const done=topics.filter(t=>completed.has(`${exam}|${subject}|${t.id}`)).length;
      out[exam].subjects[subject]=topics.length?Math.round(done/topics.length*100):0;
      doneAll+=done; totalAll+=topics.length;
    }
    out[exam].overall=totalAll?Math.round(doneAll/totalAll*100):0;
  }
  const totalTopics = Object.values(curriculum.TYT||{}).flat().length + Object.values(curriculum.AYT||{}).flat().length;
  let doneTopics = 0;
  for (const exam of ['TYT','AYT']) for (const [subject,topics] of Object.entries(curriculum[exam]||{})) doneTopics += topics.filter(t=>completed.has(`${exam}|${subject}|${t.id}`)).length;
  out.overall = totalTopics ? Math.round(doneTopics/totalTopics*100) : 0;
  return out;
}

export const BADGE_DEFS = [
  {key:'first_step',icon:'✦',label:'İlk Adım',description:'İlk çalışma oturumunu kaydet.'},
  {key:'streak_3',icon:'🔥',label:'Isınma Turu',description:'3 günlük çalışma serisine ulaş.'},
  {key:'streak_7',icon:'🔥',label:'7 Gün Ateş',description:'7 günlük çalışma serisine ulaş.'},
  {key:'questions_250',icon:'✎',label:'250 Soru',description:'Toplam 250 soru kaydet.'},
  {key:'questions_1000',icon:'🎯',label:'1000 Soru',description:'Toplam 1000 soru kaydet.'},
  {key:'resource_finish',icon:'📚',label:'Kaynak Avcısı',description:'Bir kaynağı tamamla.'},
  {key:'review_clear',icon:'↻',label:'Tekrar Ustası',description:'Tekrar listesinden 10 konuyu gerçekten tamamla.'},
  {key:'tyt_master',icon:'🏅',label:'TYT Ustası',description:'TYT müfredatını %100 tamamla.'},
  {key:'ayt_master',icon:'🏆',label:'AYT Ustası',description:'Alanına ait AYT müfredatını %100 tamamla.'}
];

export async function evaluateBadges(userId, curriculumProgress) {
  const [study,questions,resources,reviews,earned,streak] = await Promise.all([
    query(`SELECT COUNT(*)::int AS c FROM yks2_study_sessions WHERE user_id=$1`,[userId]),
    getQuestionTotals(userId),
    query(`SELECT COUNT(*)::int AS c FROM yks2_resources WHERE user_id=$1 AND completed=true`,[userId]),
    query(`SELECT COUNT(*)::int AS c FROM yks2_activity_log WHERE user_id=$1 AND activity_type='review_completed'`,[userId]),
    query(`SELECT badge_key,earned_at FROM yks2_user_badges WHERE user_id=$1`,[userId]),
    getStreak(userId)
  ]);
  const should=new Set();
  if(study.rows[0].c>0)should.add('first_step');
  if(streak.current>=3)should.add('streak_3');
  if(streak.current>=7)should.add('streak_7');
  if(questions.total>=250)should.add('questions_250');
  if(questions.total>=1000)should.add('questions_1000');
  if(resources.rows[0].c>0)should.add('resource_finish');
  if(reviews.rows[0].c>=10)should.add('review_clear');
  if(curriculumProgress?.TYT?.overall===100)should.add('tyt_master');
  if(curriculumProgress?.AYT?.overall===100)should.add('ayt_master');
  for(const key of should) await query(`INSERT INTO yks2_user_badges(user_id,badge_key) VALUES($1,$2) ON CONFLICT DO NOTHING`,[userId,key]);
  const rr=await query(`SELECT badge_key,earned_at FROM yks2_user_badges WHERE user_id=$1`,[userId]);
  const map=new Map(rr.rows.map(x=>[x.badge_key,x.earned_at]));
  return BADGE_DEFS.map(b=>({...b,earned:map.has(b.key),earnedAt:map.get(b.key)||null}));
}
