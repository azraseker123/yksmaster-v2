import { db } from '../lib/db.js';
import { schemaSql } from '../lib/schema.js';
import { onlyMethods } from '../lib/http.js';
export default async function handler(req,res){
  if(!onlyMethods(req,res,['POST']))return;
  const configured=process.env.SETUP_SECRET;
  if(!configured)return res.status(404).json({error:'Setup devre dışı.'});
  if(req.headers['x-setup-secret']!==configured)return res.status(403).json({error:'Setup anahtarı hatalı.'});
  try{await db.query(schemaSql);return res.status(200).json({ok:true,message:'YKS Master V2 tabloları hazır.'});}
  catch(err){console.error('Setup error:',err);return res.status(500).json({error:'Veritabanı kurulamadı.',detail:String(err.message||err)});}
}
