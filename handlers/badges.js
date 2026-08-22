import { requireUser } from '../lib/auth.js';
import { onlyMethods } from '../lib/http.js';
import { getCurriculumForField } from '../data/curriculum.js';
import { curriculumPercentages,evaluateBadges } from '../lib/stats.js';
export default async function handler(req,res){if(!onlyMethods(req,res,['GET']))return;const user=await requireUser(req,res,{paid:true});if(!user)return;try{const p=await curriculumPercentages(user.id,getCurriculumForField(user.track));return res.status(200).json({items:await evaluateBadges(user.id,p)});}catch(err){console.error('Badges error:',err);return res.status(500).json({error:'Rozetler yüklenemedi.'});}}
