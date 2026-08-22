import crypto from 'node:crypto';
import { requireUser } from '../lib/auth.js';
import { onlyMethods,text } from '../lib/http.js';
import { query } from '../lib/db.js';
import { turkeyDate,addDays } from '../lib/dates.js';

const code=()=>crypto.randomBytes(5).toString('base64url').toUpperCase();
async function score(userId,metric,start,end){
  if(!userId)return 0;
  if(metric==='questions'){
    const r=await query(`SELECT COALESCE(SUM(correct_count+wrong_count+blank_count),0)::int AS s FROM yks2_question_logs WHERE user_id=$1 AND log_date BETWEEN $2 AND $3`,[userId,start,end]);return r.rows[0].s;
  }
  const r=await query(`SELECT COALESCE(SUM(duration_minutes),0)::int AS s FROM yks2_study_sessions WHERE user_id=$1 AND session_date BETWEEN $2 AND $3`,[userId,start,end]);return r.rows[0].s;
}

export default async function handler(req,res){
  if(!onlyMethods(req,res,['GET','POST']))return;const user=await requireUser(req,res,{pro:true});if(!user)return;
  try{
    if(req.method==='GET'){
      const r=await query(`SELECT d.*,u1.name AS owner_name,u2.name AS challenger_name FROM yks2_duels d JOIN yks2_users u1 ON u1.id=d.owner_user_id LEFT JOIN yks2_users u2 ON u2.id=d.challenger_user_id WHERE d.owner_user_id=$1 OR d.challenger_user_id=$1 ORDER BY d.created_at DESC LIMIT 60`,[user.id]);
      const today=turkeyDate(),items=[];
      for(const d of r.rows){
        const ownerScore=await score(d.owner_user_id,d.metric,d.starts_on,d.ends_on),challengerScore=await score(d.challenger_user_id,d.metric,d.starts_on,d.ends_on);
        const finished=String(d.ends_on).slice(0,10)<today,status=!d.challenger_user_id?'waiting':finished?'finished':'active';
        let winner=null;
        if(status==='finished'&&d.challenger_user_id){
          winner=ownerScore===challengerScore?'draw':ownerScore>challengerScore?'owner':'challenger';
        }
        items.push({...d,ownerScore,challengerScore,status,winner});
      }
      return res.status(200).json({items});
    }
    const action=text(req.body?.action,20);
    if(action==='create'){
      const title=text(req.body?.title,120)||'Haftalık Düello',metric=['study_minutes','questions'].includes(req.body?.metric)?req.body.metric:'study_minutes';
      const invite=code(),start=turkeyDate(),end=addDays(start,6);
      const r=await query(`INSERT INTO yks2_duels(invite_code,owner_user_id,metric,title,starts_on,ends_on) VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,[invite,user.id,metric,title,start,end]);return res.status(201).json({item:r.rows[0]});
    }
    if(action==='join'){
      const invite=text(req.body?.code,80).toUpperCase();if(!invite)return res.status(400).json({error:'Davet kodu gerekli.'});
      const r=await query(`SELECT * FROM yks2_duels WHERE invite_code=$1`,[invite]);const d=r.rows[0];if(!d)return res.status(404).json({error:'Düello bulunamadı.'});if(Number(d.owner_user_id)===Number(user.id))return res.status(400).json({error:'Kendi düellona katılamazsın.'});if(d.challenger_user_id&&Number(d.challenger_user_id)!==Number(user.id))return res.status(409).json({error:'Bu düelloya başka biri katılmış.'});
      const today=turkeyDate();if(String(d.ends_on).slice(0,10)<today)return res.status(410).json({error:'Bu düellonun süresi dolmuş.'});
      const u=await query(`UPDATE yks2_duels SET challenger_user_id=$1 WHERE id=$2 RETURNING *`,[user.id,d.id]);return res.status(200).json({item:u.rows[0]});
    }
    return res.status(400).json({error:'Geçersiz düello işlemi.'});
  }catch(err){console.error('Duels error:',err);return res.status(500).json({error:'Düello işlemi tamamlanamadı.'});}
}
