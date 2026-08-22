import { requireUser } from '../lib/auth.js';
import { onlyMethods,text } from '../lib/http.js';
import { query,db } from '../lib/db.js';
import { LICENSE_PACKAGES,accessFor,effectivePlan } from '../lib/plans.js';
export default async function handler(req,res){
  if(!onlyMethods(req,res,['GET','POST']))return;const user=await requireUser(req,res);if(!user)return;
  if(req.method==='GET')return res.status(200).json({packages:LICENSE_PACKAGES,access:user.access,expiresAt:user.plan_expires_at});
  const code=text(req.body?.code,80).toUpperCase();if(!code)return res.status(400).json({error:'Lisans kodu gerekli.'});
  const client=await db.connect();
  try{
    await client.query('BEGIN');const r=await client.query(`SELECT * FROM yks2_license_codes WHERE code=$1 FOR UPDATE`,[code]);const lic=r.rows[0];
    if(!lic){await client.query('ROLLBACK');return res.status(404).json({error:'Lisans kodu bulunamadı.'});}
    if(lic.used_by||lic.used_at){await client.query('ROLLBACK');return res.status(409).json({error:'Bu lisans kodu daha önce kullanılmış.'});}
    if(lic.assigned_email&&lic.assigned_email.toLowerCase()!==user.email.toLowerCase()){await client.query('ROLLBACK');return res.status(403).json({error:'Bu kod başka bir e-posta için oluşturulmuş.'});}
    const pkg=LICENSE_PACKAGES[lic.package_key];if(!pkg){await client.query('ROLLBACK');return res.status(400).json({error:'Kodun paket türü geçersiz.'});}
    if(user.role==='admin'){await client.query('ROLLBACK');return res.status(409).json({error:'Admin hesabı lisans kodu tüketmez. Paket testini Ayarlar > Admin Test Modu bölümünden yap.'});}
    const currentPlan=effectivePlan(user),now=new Date(),currentExpiry=user.plan_expires_at?new Date(user.plan_expires_at):null;
    if(currentPlan==='ai_pro'&&currentExpiry&&currentExpiry>now&&pkg.plan==='basic'){
      await client.query('ROLLBACK');
      return res.status(409).json({error:'Aktif AI Pro paketin varken Temel paket kodu kullanamazsın. Kodunu AI Pro süren bittikten sonra kullan.'});
    }
    const base=currentExpiry&&currentExpiry>now&&currentPlan===pkg.plan?currentExpiry:now;const expiry=new Date(base.getTime()+pkg.durationDays*86400000);
    await client.query(`UPDATE yks2_users SET plan=$1,plan_expires_at=$2,updated_at=NOW() WHERE id=$3`,[pkg.plan,expiry,user.id]);
    await client.query(`UPDATE yks2_license_codes SET used_by=$1,used_at=NOW() WHERE id=$2`,[user.id,lic.id]);await client.query('COMMIT');
    const updated={...user,plan:pkg.plan,plan_expires_at:expiry};updated.effectivePlan=pkg.plan;return res.status(200).json({ok:true,package:lic.package_key,plan:pkg.plan,expiresAt:expiry,access:accessFor(updated)});
  }catch(err){await client.query('ROLLBACK').catch(()=>{});console.error('License error:',err);return res.status(500).json({error:'Lisans etkinleştirilemedi.'});}finally{client.release();}
}
