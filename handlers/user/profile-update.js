import bcrypt from 'bcryptjs';
import { requireUser } from '../../lib/auth.js';
import { query } from '../../lib/db.js';
import { onlyMethods,text,int,publicUser } from '../../lib/http.js';
const TRACKS=new Set(['sayisal','esit_agirlik','sozel']);
export default async function handler(req,res){
  if(!onlyMethods(req,res,['POST']))return; const user=await requireUser(req,res);if(!user)return;
  const action=text(req.body?.action,20)||'profile';
  try{
    if(action==='profile'){
      const name=text(req.body?.name,100),track=text(req.body?.track,30),city=text(req.body?.targetCity,100),uni=text(req.body?.targetUniversity,160),dept=text(req.body?.targetDepartment,160),rank=int(req.body?.targetRank,1,5000000);
      if(!name||!TRACKS.has(track)||!city||!dept||!rank)return res.status(400).json({error:'Profil alanlarını kontrol et.'});
      const r=await query(`UPDATE yks2_users SET name=$1,track=$2,target_city=$3,target_university=$4,target_department=$5,target_rank=$6,updated_at=NOW() WHERE id=$7 RETURNING *`,[name,track,city,uni,dept,rank,user.id]);
      r.rows[0].effectivePlan=user.effectivePlan;return res.status(200).json({user:publicUser(r.rows[0])});
    }
    if(action==='password'){
      const current=String(req.body?.currentPassword||''),next=String(req.body?.newPassword||'');
      if(next.length<8)return res.status(400).json({error:'Yeni şifre en az 8 karakter olmalı.'});
      const r=await query(`SELECT password_hash FROM yks2_users WHERE id=$1`,[user.id]);
      if(!(await bcrypt.compare(current,r.rows[0].password_hash)))return res.status(401).json({error:'Mevcut şifre hatalı.'});
      await query(`UPDATE yks2_users SET password_hash=$1,updated_at=NOW() WHERE id=$2`,[await bcrypt.hash(next,12),user.id]);return res.status(200).json({ok:true});
    }
    return res.status(400).json({error:'Geçersiz işlem.'});
  }catch(err){console.error('Profile update error:',err);return res.status(500).json({error:'Profil güncellenemedi.'});}
}
