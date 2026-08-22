import { requireUser } from '../lib/auth.js';
import { onlyMethods,text,int } from '../lib/http.js';
import { query } from '../lib/db.js';
import { getCurriculumForField } from '../data/curriculum.js';

export default async function handler(req,res){
  if(!onlyMethods(req,res,['GET','POST','DELETE']))return;const user=await requireUser(req,res,{paid:true});if(!user)return;
  if(req.method==='GET'){
    const imageId=int(req.query?.image,1,999999999999);
    if(imageId){
      const ir=await query(`SELECT image_data,mime_type FROM yks2_mistake_archive WHERE id=$1 AND user_id=$2`,[imageId,user.id]);
      if(!ir.rows.length)return res.status(404).end();
      const row=ir.rows[0],m=String(row.image_data||'').match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
      if(!m)return res.status(404).end();
      res.setHeader('Content-Type',m[1]);res.setHeader('Cache-Control','private, max-age=300');return res.status(200).end(Buffer.from(m[2],'base64'));
    }
    const subject=text(req.query?.subject,100),params=[user.id];let where='user_id=$1';
    if(subject){params.push(subject);where+=' AND subject=$2';}
    const r=await query(`SELECT id,exam,subject,topic,source_name,note,mime_type,favorite,resolved,created_at FROM yks2_mistake_archive WHERE ${where} ORDER BY created_at DESC LIMIT 80`,params);
    return res.status(200).json({items:r.rows});
  }
  if(req.method==='DELETE'){const id=int(req.query?.id,1,999999999999);await query(`DELETE FROM yks2_mistake_archive WHERE id=$1 AND user_id=$2`,[id,user.id]);return res.status(200).json({ok:true});}
  const action=text(req.body?.action,30);
  if(['toggleFavorite','toggleResolved'].includes(action)){
    const id=int(req.body?.id,1,999999999999),col=action==='toggleFavorite'?'favorite':'resolved';
    const r=await query(`UPDATE yks2_mistake_archive SET ${col}=NOT ${col} WHERE id=$1 AND user_id=$2 RETURNING ${col}`,[id,user.id]);return res.status(200).json({item:r.rows[0]||null});
  }
  const exam=text(req.body?.exam,3).toUpperCase(),subject=text(req.body?.subject,100),topic=text(req.body?.topic,180),sourceName=text(req.body?.sourceName,160),note=text(req.body?.note,1000),imageData=String(req.body?.imageData||'');
  const curriculum=getCurriculumForField(user.track);
  if(!['TYT','AYT'].includes(exam)||!curriculum[exam]?.[subject])return res.status(400).json({error:'Alanına uygun sınav ve ders seç.'});
  if(topic&&!curriculum[exam][subject].some(t=>t.name===topic))return res.status(400).json({error:'Seçilen konu müfredat listesinde bulunmuyor.'});
  const m=imageData.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);if(!m)return res.status(400).json({error:'Yalnızca JPEG, PNG veya WEBP soru fotoğrafı yükleyebilirsin.'});
  const mimeType=m[1];
  if(m[2].length>2_200_000)return res.status(413).json({error:'Fotoğraf çok büyük. Uygulama görseli küçültüp tekrar denemeli.'});
  const r=await query(`INSERT INTO yks2_mistake_archive(user_id,exam,subject,topic,source_name,note,image_data,mime_type) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,exam,subject,topic,source_name,note,favorite,resolved,created_at`,[user.id,exam,subject,topic,sourceName,note,imageData,mimeType]);return res.status(201).json({item:r.rows[0]});
}
