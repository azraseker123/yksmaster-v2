import { requireUser } from '../lib/auth.js';
import { onlyMethods,text,dateOnly,int } from '../lib/http.js';
import { query } from '../lib/db.js';
import { recordActivity } from '../lib/activity.js';
import { getCurriculumForField } from '../data/curriculum.js';
function calcNet(details){let n=0;for(const v of Object.values(details||{})){if(v&&typeof v==='object')n+=Number(v.correct||0)-Number(v.wrong||0)/4;}return Number(n.toFixed(2));}
export default async function handler(req,res){
  if(!onlyMethods(req,res,['GET','POST','DELETE']))return;const user=await requireUser(req,res,{paid:true});if(!user)return;
  if(req.method==='GET'){const r=await query(`SELECT id,exam_type,exam_name,exam_date::text,details,total_net,created_at FROM yks2_exam_results WHERE user_id=$1 ORDER BY exam_date DESC,id DESC LIMIT 100`,[user.id]);return res.status(200).json({items:r.rows});}
  if(req.method==='DELETE'){const id=int(req.query?.id,1,999999999999);await query(`DELETE FROM yks2_exam_results WHERE id=$1 AND user_id=$2`,[id,user.id]);return res.status(200).json({ok:true});}
  const examType=text(req.body?.examType,3).toUpperCase(),examName=text(req.body?.examName,160),examDate=dateOnly(req.body?.examDate),details=req.body?.details&&typeof req.body.details==='object'?req.body.details:{};
  if(!['TYT','AYT'].includes(examType)||!examName||!examDate)return res.status(400).json({error:'Deneme bilgilerini kontrol et.'});
  const allowed=new Set(Object.keys(getCurriculumForField(user.track)[examType]||{}));
  const clean={};
  for(const [subject,val] of Object.entries(details)){
    if(!allowed.has(subject)||!val||typeof val!=='object')continue;
    const correct=int(val.correct??0,0,500),wrong=int(val.wrong??0,0,500),blank=int(val.blank??0,0,500);
    if(correct===null||wrong===null||blank===null)return res.status(400).json({error:`${subject} için doğru, yanlış ve boş değerleri geçersiz.`});
    if(correct+wrong+blank>500)return res.status(400).json({error:`${subject} için toplam soru sayısı gerçekçi sınırın üzerinde.`});
    clean[subject]={correct,wrong,blank};
  }
  if(!Object.keys(clean).length)return res.status(400).json({error:'En az bir geçerli ders sonucu gir.'});
  if(!Object.values(clean).some(v=>v.correct+v.wrong+v.blank>0))return res.status(400).json({error:'Denemede en az bir soru sonucu gir.'});
  const totalNet=calcNet(clean);
  const r=await query(`INSERT INTO yks2_exam_results(user_id,exam_type,exam_name,exam_date,details,total_net) VALUES($1,$2,$3,$4,$5::jsonb,$6) RETURNING *`,[user.id,examType,examName,examDate,JSON.stringify(clean),totalNet]);
  await recordActivity(user.id,'exam',{examType,totalNet},examDate);return res.status(201).json({item:r.rows[0]});
}
