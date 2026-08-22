import bcrypt from 'bcryptjs';
import { query } from '../../lib/db.js';
import { createSessionToken, sessionCookie } from '../../lib/auth.js';
import { onlyMethods, text, int, normalizeEmail, publicUser } from '../../lib/http.js';
import { accessFor } from '../../lib/plans.js';

const TRACKS=new Set(['sayisal','esit_agirlik','sozel']);

export default async function handler(req,res){
  if(!onlyMethods(req,res,['POST']))return;
  const name=text(req.body?.name,100), email=normalizeEmail(req.body?.email), password=String(req.body?.password||'');
  const track=text(req.body?.track,30), targetCity=text(req.body?.targetCity,100), targetUniversity=text(req.body?.targetUniversity,160);
  const targetDepartment=text(req.body?.targetDepartment,160), targetRank=int(req.body?.targetRank,1,5000000);
  if(!name||!email||!password||!TRACKS.has(track)||!targetCity||!targetDepartment||!targetRank) return res.status(400).json({error:'Lütfen zorunlu alanların tamamını doldur.'});
  if(!/^\S+@\S+\.\S+$/.test(email))return res.status(400).json({error:'Geçerli bir e-posta gir.'});
  if(password.length<8)return res.status(400).json({error:'Şifre en az 8 karakter olmalı.'});
  try{
    const exists=await query(`SELECT id FROM yks2_users WHERE email=$1`,[email]);
    if(exists.rows.length)return res.status(409).json({error:'Bu e-posta ile kayıtlı bir hesap var.'});
    const hash=await bcrypt.hash(password,12);
    const adminEmail=(process.env.ADMIN_EMAIL||'').trim().toLowerCase();
    const role=adminEmail&&email===adminEmail?'admin':'user';
    const plan=role==='admin'?'ai_pro':'none';
    const expires=role==='admin'?new Date('2099-12-31T23:59:59Z'):null;
    const r=await query(`INSERT INTO yks2_users(name,email,password_hash,track,target_city,target_university,target_department,target_rank,role,plan,plan_expires_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,[name,email,hash,track,targetCity,targetUniversity,targetDepartment,targetRank,role,plan,expires]);
    const user=r.rows[0]; user.effectivePlan=plan;
    res.setHeader('Set-Cookie',sessionCookie(createSessionToken(user)));
    return res.status(201).json({user:publicUser(user),access:accessFor(user)});
  }catch(err){console.error('Register error:',err);if(err?.code==='23505')return res.status(409).json({error:'Bu e-posta ile kayıtlı bir hesap var.'});return res.status(500).json({error:'Kayıt sırasında sunucu hatası oluştu.'});}
}
