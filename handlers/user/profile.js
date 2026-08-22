import { requireUser } from '../../lib/auth.js';
import { onlyMethods, publicUser } from '../../lib/http.js';
export default async function handler(req,res){if(!onlyMethods(req,res,['GET']))return;try{const user=await requireUser(req,res);if(!user)return;return res.status(200).json({user:publicUser(user),access:user.access});}catch(err){console.error('Profile error:',err);return res.status(500).json({error:'Profil yüklenemedi.'});}}
