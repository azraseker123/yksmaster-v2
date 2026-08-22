import { clearSessionCookie } from '../../lib/auth.js';
import { onlyMethods } from '../../lib/http.js';
export default function handler(req,res){if(!onlyMethods(req,res,['POST']))return;res.setHeader('Set-Cookie',clearSessionCookie());return res.status(200).json({ok:true});}
