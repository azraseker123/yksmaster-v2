import { requireUser } from '../lib/auth.js';
import { onlyMethods,text,int } from '../lib/http.js';
import { query } from '../lib/db.js';
import { recordActivity } from '../lib/activity.js';
import { getCurriculumForField } from '../data/curriculum.js';

function subjectAllowed(track,exam,subject){
  const c=getCurriculumForField(track);
  return Boolean(c[exam]?.[subject]);
}

export default async function handler(req,res){
  if(!onlyMethods(req,res,['GET','POST','DELETE']))return;
  const user=await requireUser(req,res,{paid:true});
  if(!user)return;

  if(req.method==='GET'){
    const r=await query(`SELECT * FROM yks2_resources WHERE user_id=$1 ORDER BY completed,name`,[user.id]);
    return res.status(200).json({items:r.rows});
  }

  if(req.method==='DELETE'){
    const id=int(req.query?.id,1,999999999999);
    if(!id)return res.status(400).json({error:'Geçersiz kaynak.'});
    await query(`DELETE FROM yks2_resources WHERE id=$1 AND user_id=$2`,[id,user.id]);
    return res.status(200).json({ok:true});
  }

  const action=text(req.body?.action,20);
  if(action==='toggle'){
    const id=int(req.body?.id,1,999999999999);
    if(!id)return res.status(400).json({error:'Geçersiz kaynak.'});
    const r=await query(
      `UPDATE yks2_resources SET completed=NOT completed,updated_at=NOW()
       WHERE id=$1 AND user_id=$2 RETURNING completed,name`,
      [id,user.id]
    );
    if(!r.rows.length)return res.status(404).json({error:'Kaynak bulunamadı.'});
    if(r.rows[0].completed)await recordActivity(user.id,'resource_completed',{name:r.rows[0].name});
    return res.status(200).json({item:r.rows[0]});
  }

  const name=text(req.body?.name,160);
  const exam=text(req.body?.exam,3).toUpperCase();
  const subject=text(req.body?.subject,100);
  const totalQuestions=int(req.body?.totalQuestions,0,100000);
  if(!name||!['TYT','AYT'].includes(exam)||!subject)return res.status(400).json({error:'Kaynak adı, sınav ve ders gerekli.'});
  if(!subjectAllowed(user.track,exam,subject))return res.status(400).json({error:'Alanına uygun geçerli bir YKS dersi seç.'});

  const r=await query(
    `INSERT INTO yks2_resources(user_id,name,exam,subject,total_questions)
     VALUES($1,$2,$3,$4,$5) RETURNING *`,
    [user.id,name,exam,subject,totalQuestions]
  );
  return res.status(201).json({item:r.rows[0]});
}
