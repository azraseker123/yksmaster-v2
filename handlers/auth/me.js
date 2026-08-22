import { getCurrentUser } from '../../lib/auth.js';
import { onlyMethods, publicUser } from '../../lib/http.js';
export default async function handler(req,res){
  if(!onlyMethods(req,res,['GET']))return;
  try{const user=await getCurrentUser(req);if(!user)return res.status(401).json({error:'Oturum bulunamadı.'});return res.status(200).json({user:publicUser(user),access:user.access});}
  catch(err){console.error('Session error:',err);return res.status(500).json({error:'Oturum kontrol edilemedi.'});}
}
