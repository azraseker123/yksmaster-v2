import { requireUser } from '../lib/auth.js';
import { onlyMethods } from '../lib/http.js';
import { query } from '../lib/db.js';
import { getSubjectPerformance } from '../lib/stats.js';
import { getStreak } from '../lib/activity.js';
import { turkeyDate } from '../lib/dates.js';
export default async function handler(req,res){
  if(!onlyMethods(req,res,['GET']))return;const user=await requireUser(req,res,{paid:true});if(!user)return;
  try{
    const [lastStudy,review,todayPlan,lastExam,performance,streak]=await Promise.all([
      query(`SELECT MAX(session_date)::text AS d FROM yks2_study_sessions WHERE user_id=$1`,[user.id]),
      query(`SELECT COUNT(*)::int AS c FROM yks2_curriculum_progress WHERE user_id=$1 AND review_needed=true`,[user.id]),
      query(`SELECT COUNT(*)::int AS total,COUNT(*) FILTER(WHERE completed)::int AS done FROM yks2_daily_plans WHERE user_id=$1 AND plan_date=(NOW() AT TIME ZONE 'Europe/Istanbul')::date`,[user.id]),
      query(`SELECT MAX(exam_date)::text AS d FROM yks2_exam_results WHERE user_id=$1`,[user.id]),
      getSubjectPerformance(user.id),getStreak(user.id)
    ]);
    const items=[];const today=turkeyDate();
    const toUTC=s=>new Date(`${s}T12:00:00Z`);
    const daysSince=s=>s?Math.floor((toUTC(today)-toUTC(s))/86400000):999;
    if(daysSince(lastStudy.rows[0].d)>=2)items.push({level:'warning',title:'Çalışma kaydı bekliyor',text:'Son 2 gündür çalışma süresi kaydı görünmüyor. Bugün kısa bir odak oturumu başlat.'});
    if(review.rows[0].c>0)items.push({level:'info',title:'Tekrar listen hazır',text:`Tekrar bekleyen ${review.rows[0].c} konun var. Bugünkü plana en az birini ekleyebilirsin.`});
    const weak=[...performance].filter(x=>x.total>=20).sort((a,b)=>a.successRate-b.successRate)[0];
    if(weak&&weak.successRate<65)items.push({level:'warning',title:`${weak.subject} dikkat istiyor`,text:`Kayıtlı sorularda başarı oranı %${weak.successRate}. Konu bazlı tekrar ve kısa test planla.`});
    if(todayPlan.rows[0].total>0&&todayPlan.rows[0].done<todayPlan.rows[0].total)items.push({level:'info',title:'Bugünün planı tamamlanmadı',text:`${todayPlan.rows[0].done}/${todayPlan.rows[0].total} görev tamamlandı.`});
    if(daysSince(lastExam.rows[0].d)>=14)items.push({level:'info',title:'Deneme zamanı',text:'Son deneme kaydının üzerinden yaklaşık iki hafta geçti. Yeni bir deneme ile seviyeni ölç.'});
    if(streak.current>=3)items.push({level:'success',title:`🔥 ${streak.current} günlük seri`,text:'Serin devam ediyor. Bugün en az bir gerçek çalışma aktivitesi kaydet.'});
    if(!items.length)items.push({level:'success',title:'Her şey yolunda',text:'Yeni veriler girdikçe burada kişisel uyarılar oluşacak.'});
    return res.status(200).json({items});
  }catch(err){console.error('Alerts error:',err);return res.status(500).json({error:'Uyarılar yüklenemedi.'});}
}
