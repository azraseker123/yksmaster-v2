import { requireUser } from '../lib/auth.js';
import { onlyMethods,text,int,dateOnly } from '../lib/http.js';
import { query,db } from '../lib/db.js';
import { recordActivity } from '../lib/activity.js';
import { getCurriculumForField } from '../data/curriculum.js';
import { turkeyDate,addDays } from '../lib/dates.js';

function allowedSubject(curriculum, exam, subject) {
  return Boolean(curriculum[exam]?.[subject]);
}

function allowedTopic(curriculum, exam, subject, topic) {
  if (!topic) return true;
  return (curriculum[exam]?.[subject] || []).some(t => t.name === topic);
}

function validateAiTask(curriculum, task) {
  const exam=text(task?.exam,3).toUpperCase();
  const subject=text(task?.subject,100);
  const topic=text(task?.topic,180);
  const note=text(task?.reason||task?.note,500);
  const targetMinutes=int(task?.minutes??task?.targetMinutes,1,720)||30;
  if(!['TYT','AYT'].includes(exam))throw new Error('AI programında geçersiz sınav türü bulundu.');
  if(!allowedSubject(curriculum,exam,subject))throw new Error('AI programında alanına uymayan ders bulundu.');
  if(!topic||!allowedTopic(curriculum,exam,subject,topic))throw new Error('AI programında müfredatla eşleşmeyen konu bulundu.');
  return {exam,subject,topic,note,targetMinutes};
}

export default async function handler(req,res){
  if(!onlyMethods(req,res,['GET','POST','DELETE']))return;
  const user=await requireUser(req,res,{paid:true});if(!user)return;
  const curriculum=getCurriculumForField(user.track);

  if(req.method==='GET'){
    const from=dateOnly(req.query?.from)||turkeyDate();
    const r=await query(`SELECT id,plan_date::text,exam,subject,topic,note,target_minutes,completed,created_by FROM yks2_daily_plans WHERE user_id=$1 AND plan_date BETWEEN $2::date AND $2::date+INTERVAL '13 days' ORDER BY plan_date,id`,[user.id,from]);
    return res.status(200).json({items:r.rows});
  }

  if(req.method==='DELETE'){
    const id=int(req.query?.id,1,999999999999);if(!id)return res.status(400).json({error:'Geçersiz kayıt.'});
    await query(`DELETE FROM yks2_daily_plans WHERE id=$1 AND user_id=$2`,[id,user.id]);
    return res.status(200).json({ok:true});
  }

  const action=text(req.body?.action,20);
  if(action==='toggle'){
    const id=int(req.body?.id,1,999999999999);if(!id)return res.status(400).json({error:'Geçersiz kayıt.'});
    const r=await query(`UPDATE yks2_daily_plans SET completed=NOT completed WHERE id=$1 AND user_id=$2 RETURNING completed,plan_date::text,exam,subject,topic`,[id,user.id]);
    if(r.rows[0]?.completed)await recordActivity(user.id,'plan_completed',{exam:r.rows[0].exam,subject:r.rows[0].subject,topic:r.rows[0].topic},r.rows[0].plan_date);
    return res.status(200).json({item:r.rows[0]||null});
  }

  if(action==='bulkAi'){
    if(!user.access.canUseAiProgram)return res.status(403).json({error:'AI programı AI Pro paketine özel.'});
    const days=Array.isArray(req.body?.days)?req.body.days:[];
    if(days.length!==7)return res.status(400).json({error:'AI programı 7 gün içermeli.'});
    const start=turkeyDate();
    const allowedDates=new Set(Array.from({length:7},(_,i)=>addDays(start,i)));
    const rows=[];
    try{
      for(const day of days){
        const planDate=dateOnly(day?.date);
        if(!planDate||!allowedDates.has(planDate))throw new Error('AI programında geçersiz tarih bulundu.');
        const tasks=Array.isArray(day?.tasks)?day.tasks:[];
        if(tasks.length>12)throw new Error('Bir güne çok fazla görev eklenmiş.');
        for(const task of tasks)rows.push({planDate,...validateAiTask(curriculum,task)});
      }
      if(!rows.length)return res.status(400).json({error:'AI programında kaydedilecek görev yok.'});
      const client=await db.connect();
      try{
        await client.query('BEGIN');
        for(const x of rows){
          await client.query(
            `INSERT INTO yks2_daily_plans(user_id,plan_date,exam,subject,topic,note,target_minutes,created_by)
             VALUES($1,$2,$3,$4,$5,$6,$7,'ai')`,
            [user.id,x.planDate,x.exam,x.subject,x.topic,x.note,x.targetMinutes]
          );
        }
        await client.query('COMMIT');
      }catch(err){
        await client.query('ROLLBACK').catch(()=>{});
        throw err;
      }finally{client.release();}
      return res.status(201).json({ok:true,count:rows.length});
    }catch(err){
      return res.status(400).json({error:err.message||'AI programı kaydedilemedi.'});
    }
  }

  const planDate=dateOnly(req.body?.planDate);
  const exam=text(req.body?.exam,3).toUpperCase();
  const subject=text(req.body?.subject,100);
  const topic=text(req.body?.topic,180);
  const note=text(req.body?.note,500);
  const targetMinutes=int(req.body?.targetMinutes,1,720)||30;
  const createdBy=req.body?.createdBy==='ai'?'ai':'user';

  if(createdBy==='ai')return res.status(400).json({error:'AI programı yalnızca toplu AI programı işlemiyle kaydedilebilir.'});
  if(!planDate||!['TYT','AYT'].includes(exam)||!subject)return res.status(400).json({error:'Tarih, sınav ve ders gerekli.'});
  if(!allowedSubject(curriculum,exam,subject))return res.status(400).json({error:'Alanına uygun geçerli bir YKS dersi seç.'});
  if(topic&&!allowedTopic(curriculum,exam,subject,topic))return res.status(400).json({error:'Seçilen konu 2026 YKS takip müfredatıyla eşleşmiyor.'});

  const r=await query(
    `INSERT INTO yks2_daily_plans(user_id,plan_date,exam,subject,topic,note,target_minutes,created_by)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [user.id,planDate,exam,subject,topic,note,targetMinutes,createdBy]
  );
  return res.status(201).json({item:r.rows[0]});
}
