import { requireUser } from '../lib/auth.js';
import { onlyMethods,text,int,dateOnly } from '../lib/http.js';
import { query } from '../lib/db.js';
import { recordActivity } from '../lib/activity.js';
import { turkeyDate } from '../lib/dates.js';
import { getCurriculumForField } from '../data/curriculum.js';

function subjectAllowed(track,subject){
  if(!subject)return true;
  const c=getCurriculumForField(track);
  return Boolean(c.TYT?.[subject]||c.AYT?.[subject]);
}

export default async function handler(req,res){
  if(!onlyMethods(req,res,['GET','POST','DELETE']))return;
  const user=await requireUser(req,res,{paid:true});
  if(!user)return;

  if(req.method==='GET'){
    const r=await query(`SELECT id,session_date::text,subject,topic,duration_minutes,source,created_at FROM yks2_study_sessions WHERE user_id=$1 ORDER BY session_date DESC,id DESC LIMIT 200`,[user.id]);
    return res.status(200).json({items:r.rows});
  }

  if(req.method==='DELETE'){
    const id=int(req.query?.id,1,999999999999);
    if(!id)return res.status(400).json({error:'Geçersiz çalışma kaydı.'});
    await query(`DELETE FROM yks2_study_sessions WHERE id=$1 AND user_id=$2`,[id,user.id]);
    return res.status(200).json({ok:true});
  }

  const sessionDate=dateOnly(req.body?.sessionDate)||turkeyDate();
  const subject=text(req.body?.subject,100);
  const topic=text(req.body?.topic,180);
  const durationMinutes=int(req.body?.durationMinutes,1,1440);
  const source=req.body?.source==='pomodoro'?'pomodoro':'manual';
  if(!durationMinutes)return res.status(400).json({error:'Geçerli çalışma süresi gir.'});
  if(!subjectAllowed(user.track,subject))return res.status(400).json({error:'Alanına uygun geçerli bir YKS dersi seç.'});

  const r=await query(
    `INSERT INTO yks2_study_sessions(user_id,session_date,subject,topic,duration_minutes,source)
     VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
    [user.id,sessionDate,subject,topic,durationMinutes,source]
  );
  await recordActivity(user.id,'study',{subject,topic,minutes:durationMinutes,source},sessionDate);
  return res.status(201).json({item:r.rows[0]});
}
