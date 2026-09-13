import { clearSessionCookie, requireUser } from '../../lib/auth.js';
import { onlyMethods } from '../../lib/http.js';
import { query } from '../../lib/db.js';

export default async function handler(req,res){
  if(!onlyMethods(req,res,['POST']))return;

  const allDevices = Boolean(req.body?.allDevices);

  if(allDevices){
    const user = await requireUser(req,res);
    if(!user)return;

    await query(
      `UPDATE yks2_users
       SET session_version = session_version + 1
       WHERE id = $1`,
      [user.id]
    );
  }

  res.setHeader(
    'Set-Cookie',
    clearSessionCookie()
  );

  return res.status(200).json({
    ok:true
  });
}
