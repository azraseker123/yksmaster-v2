import { requireUser } from '../lib/auth.js';
import { onlyMethods,text,int,dateOnly } from '../lib/http.js';
import { query } from '../lib/db.js';
export default async function handler(req,res){
  if(!onlyMethods(req,res,['GET','POST','DELETE']))return;const user=await requireUser(req,res,{paid:true});if(!user)return;
  if(req.method==='GET'){const r=await query(`SELECT id,sleep_date::text,bedtime::text,wake_time::text,duration_minutes,quality FROM yks2_sleep_logs WHERE user_id=$1 ORDER BY sleep_date DESC LIMIT 90`,[user.id]);return res.status(200).json({items:r.rows});}
  if(req.method==='DELETE'){const id=int(req.query?.id,1,999999999999);await query(`DELETE FROM yks2_sleep_logs WHERE id=$1 AND user_id=$2`,[id,user.id]);return res.status(200).json({ok:true});}
  const sleepDate=dateOnly(req.body?.sleepDate),bedtime=text(req.body?.bedtime,5),wakeTime=text(req.body?.wakeTime,5),quality=int(req.body?.quality,1,5);
  if(!sleepDate||!/^([01]\d|2[0-3]):[0-5]\d$/.test(bedtime)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(wakeTime))return res.status(400).json({error:'Uyku bilgilerini kontrol et.'});
  const mins=s=>{const[h,m]=s.split(':').map(Number);return h*60+m};let duration=mins(wakeTime)-mins(bedtime);if(duration<=0)duration+=1440;
  const r=await query(`INSERT INTO yks2_sleep_logs(user_id,sleep_date,bedtime,wake_time,duration_minutes,quality) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(user_id,sleep_date) DO UPDATE SET bedtime=EXCLUDED.bedtime,wake_time=EXCLUDED.wake_time,duration_minutes=EXCLUDED.duration_minutes,quality=EXCLUDED.quality RETURNING *`,[user.id,sleepDate,bedtime,wakeTime,duration,quality]);return res.status(200).json({item:r.rows[0]});
}
