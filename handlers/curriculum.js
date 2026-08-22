import { requireUser } from '../lib/auth.js';
import { onlyMethods,text } from '../lib/http.js';
import { query } from '../lib/db.js';
import { recordActivity } from '../lib/activity.js';
import { getCurriculumForField } from '../data/curriculum.js';

export default async function handler(req,res){
  if(!onlyMethods(req,res,['GET','POST']))return;
  const user=await requireUser(req,res,{paid:true});
  if(!user)return;
  const curriculum=getCurriculumForField(user.track);

  if(req.method==='GET'){
    const r=await query(
      `SELECT exam,subject,topic_id,completed,review_needed,completed_at
       FROM yks2_curriculum_progress WHERE user_id=$1`,
      [user.id]
    );
    return res.status(200).json({curriculum,progress:r.rows});
  }

  const exam=text(req.body?.exam,3).toUpperCase();
  const subject=text(req.body?.subject,100);
  const topicId=text(req.body?.topicId,120);
  const completed=Boolean(req.body?.completed);
  const reviewNeeded=Boolean(req.body?.reviewNeeded);

  if(!['TYT','AYT'].includes(exam)||!curriculum[exam]?.[subject]?.some(t=>t.id===topicId)){
    return res.status(400).json({error:'Geçersiz müfredat konusu.'});
  }

  const previous=await query(
    `SELECT completed,review_needed FROM yks2_curriculum_progress
     WHERE user_id=$1 AND exam=$2 AND subject=$3 AND topic_id=$4`,
    [user.id,exam,subject,topicId]
  );
  const before=previous.rows[0]||{completed:false,review_needed:false};

  await query(
    `INSERT INTO yks2_curriculum_progress(user_id,exam,subject,topic_id,completed,review_needed,completed_at,updated_at)
     VALUES($1,$2,$3,$4,$5,$6,CASE WHEN $5 THEN NOW() ELSE NULL END,NOW())
     ON CONFLICT(user_id,exam,subject,topic_id) DO UPDATE SET
       completed=EXCLUDED.completed,
       review_needed=EXCLUDED.review_needed,
       completed_at=CASE
         WHEN EXCLUDED.completed THEN COALESCE(yks2_curriculum_progress.completed_at,NOW())
         ELSE NULL
       END,
       updated_at=NOW()`,
    [user.id,exam,subject,topicId,completed,reviewNeeded]
  );

  if(completed&&!before.completed){
    await recordActivity(user.id,'curriculum_completed',{exam,subject,topicId});
  }
  if(before.review_needed&&!reviewNeeded){
    await recordActivity(user.id,'review_completed',{exam,subject,topicId});
  }

  return res.status(200).json({ok:true});
}
