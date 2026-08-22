import { requireUser } from '../lib/auth.js';
import { onlyMethods,text,int,dateOnly } from '../lib/http.js';
import { query, db } from '../lib/db.js';
import { recordActivity } from '../lib/activity.js';
import { getSubjectPerformance } from '../lib/stats.js';
import { getCurriculumForField } from '../data/curriculum.js';
import { turkeyDate } from '../lib/dates.js';

export default async function handler(req,res){
  if(!onlyMethods(req,res,['GET','POST','DELETE']))return;
  const user=await requireUser(req,res,{paid:true});
  if(!user)return;

  if(req.method==='GET'){
    if(req.query?.mode==='performance')return res.status(200).json({performance:await getSubjectPerformance(user.id)});
    const r=await query(
      `SELECT q.id,q.exam,q.subject,q.topic,q.correct_count,q.wrong_count,q.blank_count,q.log_date::text,
              q.source_id,r.name AS source_name
       FROM yks2_question_logs q
       LEFT JOIN yks2_resources r ON r.id=q.source_id AND r.user_id=q.user_id
       WHERE q.user_id=$1 ORDER BY q.log_date DESC,q.id DESC LIMIT 300`,
      [user.id]
    );
    return res.status(200).json({items:r.rows});
  }

  if(req.method==='DELETE'){
    const id=int(req.query?.id,1,999999999999);
    if(!id)return res.status(400).json({error:'Geçersiz kayıt.'});
    const client=await db.connect();
    try{
      await client.query('BEGIN');
      const found=await client.query(
        `SELECT source_id,correct_count,wrong_count,blank_count FROM yks2_question_logs
         WHERE id=$1 AND user_id=$2 FOR UPDATE`,
        [id,user.id]
      );
      const row=found.rows[0];
      if(!row){await client.query('ROLLBACK');return res.status(404).json({error:'Soru kaydı bulunamadı.'});}
      await client.query(`DELETE FROM yks2_question_logs WHERE id=$1 AND user_id=$2`,[id,user.id]);
      if(row.source_id){
        await client.query(
          `UPDATE yks2_resources SET
             solved_questions=GREATEST(0,solved_questions-$1),
             correct_count=GREATEST(0,correct_count-$2),
             wrong_count=GREATEST(0,wrong_count-$3),
             blank_count=GREATEST(0,blank_count-$4),updated_at=NOW()
           WHERE id=$5 AND user_id=$6`,
          [row.correct_count+row.wrong_count+row.blank_count,row.correct_count,row.wrong_count,row.blank_count,row.source_id,user.id]
        );
      }
      await client.query('COMMIT');
      return res.status(200).json({ok:true});
    }catch(err){
      await client.query('ROLLBACK').catch(()=>{});
      console.error('Question delete error:',err);
      return res.status(500).json({error:'Soru kaydı silinemedi.'});
    }finally{client.release();}
  }

  const exam=text(req.body?.exam,3).toUpperCase();
  const subject=text(req.body?.subject,100);
  const topic=text(req.body?.topic,180);
  const correct=int(req.body?.correct,0,10000)??0;
  const wrong=int(req.body?.wrong,0,10000)??0;
  const blank=int(req.body?.blank,0,10000)??0;
  const sourceId=int(req.body?.sourceId,1,999999999999);
  const logDate=dateOnly(req.body?.logDate)||turkeyDate();
  const curriculum=getCurriculumForField(user.track);

  if(!['TYT','AYT'].includes(exam)||!curriculum[exam]?.[subject])return res.status(400).json({error:'Alanına uygun bir sınav ve ders seç.'});
  if(topic&&!curriculum[exam][subject].some(t=>t.name===topic))return res.status(400).json({error:'Seçilen konu müfredat listesinde bulunmuyor.'});
  if(correct+wrong+blank<=0)return res.status(400).json({error:'En az bir soru kaydı gir.'});

  if(sourceId){
    const own=await query(`SELECT id,exam,subject FROM yks2_resources WHERE id=$1 AND user_id=$2`,[sourceId,user.id]);
    if(!own.rows.length)return res.status(400).json({error:'Seçilen kaynak bu hesaba ait değil.'});
    if(own.rows[0].exam!==exam||own.rows[0].subject!==subject)return res.status(400).json({error:'Seçilen kaynak, soru kaydındaki sınav ve dersle eşleşmiyor.'});
  }

  const client=await db.connect();
  try{
    await client.query('BEGIN');
    const r=await client.query(
      `INSERT INTO yks2_question_logs(user_id,exam,subject,topic,correct_count,wrong_count,blank_count,source_id,log_date)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [user.id,exam,subject,topic,correct,wrong,blank,sourceId||null,logDate]
    );
    if(sourceId){
      await client.query(
        `UPDATE yks2_resources SET solved_questions=solved_questions+$1,correct_count=correct_count+$2,
          wrong_count=wrong_count+$3,blank_count=blank_count+$4,updated_at=NOW()
         WHERE id=$5 AND user_id=$6`,
        [correct+wrong+blank,correct,wrong,blank,sourceId,user.id]
      );
    }
    await client.query('COMMIT');
    await recordActivity(user.id,'questions',{exam,subject,count:correct+wrong+blank},logDate);
    return res.status(201).json({item:r.rows[0]});
  }catch(err){
    await client.query('ROLLBACK').catch(()=>{});
    console.error('Question create error:',err);
    return res.status(500).json({error:'Soru kaydı eklenemedi.'});
  }finally{client.release();}
}
