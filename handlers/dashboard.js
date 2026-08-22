import { requireUser } from '../lib/auth.js';
import { onlyMethods,publicUser } from '../lib/http.js';
import { query } from '../lib/db.js';
import { getCurriculumForField } from '../data/curriculum.js';
import { curriculumPercentages,getQuestionTotals,getStudySummary,getSubjectPerformance,evaluateBadges } from '../lib/stats.js';
import { getStreak } from '../lib/activity.js';
export default async function handler(req,res){
  if(!onlyMethods(req,res,['GET']))return;const user=await requireUser(req,res,{paid:true});if(!user)return;
  try{
    const curriculum=getCurriculumForField(user.track);
    const [study,questions,streak,performance,percent,lastExam,todayPlan]=await Promise.all([
      getStudySummary(user.id),getQuestionTotals(user.id),getStreak(user.id),getSubjectPerformance(user.id),curriculumPercentages(user.id,curriculum),
      query(`SELECT exam_type,exam_name,exam_date::text,total_net FROM yks2_exam_results WHERE user_id=$1 ORDER BY exam_date DESC,id DESC LIMIT 1`,[user.id]),
      query(`SELECT id,plan_date::text,exam,subject,topic,target_minutes,completed,created_by FROM yks2_daily_plans WHERE user_id=$1 AND plan_date=(NOW() AT TIME ZONE 'Europe/Istanbul')::date ORDER BY id`,[user.id])
    ]);
    const badges=await evaluateBadges(user.id,percent),attempted=questions.correct+questions.wrong;
    return res.status(200).json({user:publicUser(user),access:user.access,study,questions:{...questions,successRate:attempted?Math.round(questions.correct/attempted*100):0},streak,performance,curriculum:percent,lastExam:lastExam.rows[0]||null,todayPlan:todayPlan.rows,latestBadges:badges.filter(x=>x.earned).slice(-3)});
  }catch(err){console.error('Dashboard error:',err);return res.status(500).json({error:'Dashboard yüklenemedi.'});}
}
