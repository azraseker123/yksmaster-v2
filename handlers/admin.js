import crypto from 'node:crypto';
import { requireUser, adminPreviewCookie } from '../lib/auth.js';
import { onlyMethods,text,int } from '../lib/http.js';
import { query } from '../lib/db.js';
import { LICENSE_PACKAGES } from '../lib/plans.js';
import { getCurriculumForField } from '../data/curriculum.js';
import { turkeyDate, addDays } from '../lib/dates.js';

function makeCode(){
  return `YKS-${crypto.randomBytes(3).toString('hex').toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

function firstTopic(curriculum, exam, subject){
  return curriculum?.[exam]?.[subject]?.[0] || null;
}

async function seedAdminDemo(user){
  const marker='[YKS MASTER DEMO]';
  const existing=await query(`SELECT id FROM yks2_resources WHERE user_id=$1 AND name=$2 LIMIT 1`,[user.id,`${marker} Matematik Kaynağı`]);
  if(existing.rows.length) return {alreadySeeded:true};

  const curriculum=getCurriculumForField(user.track);
  const today=turkeyDate();
  const tytMath=firstTopic(curriculum,'TYT','Matematik');
  const tytTurkish=firstTopic(curriculum,'TYT','Türkçe');
  const aytSubject=Object.keys(curriculum.AYT||{})[0];
  const aytTopic=aytSubject?firstTopic(curriculum,'AYT',aytSubject):null;

  const resource=await query(
    `INSERT INTO yks2_resources(user_id,name,exam,subject,total_questions,solved_questions,correct_count,wrong_count,blank_count)
     VALUES($1,$2,'TYT','Matematik',600,180,132,36,12) RETURNING id`,
    [user.id,`${marker} Matematik Kaynağı`]
  );
  const resourceId=resource.rows[0].id;

  const questionRows=[
    ['TYT','Matematik',tytMath?.name||'Temel Kavramlar',34,8,3,-6,resourceId],
    ['TYT','Matematik',tytMath?.name||'Temel Kavramlar',31,9,2,-4,resourceId],
    ['TYT','Türkçe',tytTurkish?.name||'Sözcükte Anlam',28,5,2,-3,null],
    ['TYT','Türkçe',tytTurkish?.name||'Sözcükte Anlam',30,4,1,-1,null]
  ];
  if(aytSubject&&aytTopic) questionRows.push(['AYT',aytSubject,aytTopic.name,22,6,2,-2,null]);
  for(const [exam,subject,topic,c,w,b,offset,sourceId] of questionRows){
    await query(
      `INSERT INTO yks2_question_logs(user_id,exam,subject,topic,correct_count,wrong_count,blank_count,source_id,log_date)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::date)`,
      [user.id,exam,subject,topic,c,w,b,sourceId,addDays(today,offset)]
    );
  }

  for(let i=0;i<7;i++){
    const date=addDays(today,-i);
    const minutes=60+(i%3)*20;
    await query(
      `INSERT INTO yks2_study_sessions(user_id,session_date,subject,topic,duration_minutes,source)
       VALUES($1,$2::date,$3,$4,$5,'pomodoro')`,
      [user.id,date,i%2?'Matematik':'Türkçe',i%2?(tytMath?.name||'Temel Kavramlar'):(tytTurkish?.name||'Sözcükte Anlam'),minutes]
    );
    await query(
      `INSERT INTO yks2_activity_log(user_id,activity_type,activity_date,metadata)
       VALUES($1,'study',$2::date,$3::jsonb)`,
      [user.id,date,JSON.stringify({demo:true,minutes})]
    );
  }

  const planRows=[
    [today,'TYT','Matematik',tytMath?.name||'Temel Kavramlar',50,false],
    [today,'TYT','Türkçe',tytTurkish?.name||'Sözcükte Anlam',35,true],
    [addDays(today,1),aytSubject?'AYT':'TYT',aytSubject||'Matematik',aytTopic?.name||tytMath?.name||'Temel Kavramlar',60,false]
  ];
  for(const [date,exam,subject,topic,minutes,completed] of planRows){
    await query(
      `INSERT INTO yks2_daily_plans(user_id,plan_date,exam,subject,topic,note,target_minutes,completed,created_by)
       VALUES($1,$2::date,$3,$4,$5,$6,$7,$8,'user')`,
      [user.id,date,exam,subject,topic,`${marker} Test görevi`,minutes,completed]
    );
  }

  const examDetails={
    Türkçe:{correct:31,wrong:7,blank:2,net:29.25},
    Matematik:{correct:27,wrong:8,blank:5,net:25},
    Tarih:{correct:4,wrong:1,blank:0,net:3.75},
    Coğrafya:{correct:4,wrong:1,blank:0,net:3.75},
    Felsefe:{correct:4,wrong:1,blank:0,net:3.75},
    'Din Kültürü':{correct:4,wrong:1,blank:0,net:3.75},
    Fizik:{correct:5,wrong:2,blank:0,net:4.5},
    Kimya:{correct:5,wrong:1,blank:1,net:4.75},
    Biyoloji:{correct:5,wrong:1,blank:0,net:4.75}
  };
  await query(
    `INSERT INTO yks2_exam_results(user_id,exam_type,exam_name,exam_date,details,total_net)
     VALUES($1,'TYT',$2,$3::date,$4::jsonb,$5)`,
    [user.id,`${marker} TYT Denemesi`,addDays(today,-2),JSON.stringify(examDetails),83.5]
  );

  for(let i=0;i<4;i++){
    const date=addDays(today,-i);
    await query(
      `INSERT INTO yks2_sleep_logs(user_id,sleep_date,bedtime,wake_time,duration_minutes,quality)
       VALUES($1,$2::date,'23:45','07:15',450,$3)
       ON CONFLICT(user_id,sleep_date) DO NOTHING`,
      [user.id,date,i===0?4:3]
    );
  }

  const curriculumSeeds=[
    ...((curriculum.TYT?.Matematik||[]).slice(0,5).map(t=>['TYT','Matematik',t.id,true,false])),
    ...((curriculum.TYT?.Türkçe||[]).slice(0,3).map((t,i)=>['TYT','Türkçe',t.id,i<2,i===2])),
    ...((curriculum.AYT?.[aytSubject]||[]).slice(0,3).map((t,i)=>['AYT',aytSubject,t.id,i===0,i===1]))
  ];
  for(const [exam,subject,topicId,completed,reviewNeeded] of curriculumSeeds){
    await query(
      `INSERT INTO yks2_curriculum_progress(user_id,exam,subject,topic_id,completed,review_needed,completed_at,updated_at)
       VALUES($1,$2,$3,$4,$5,$6,CASE WHEN $5 THEN NOW() ELSE NULL END,NOW())
       ON CONFLICT(user_id,exam,subject,topic_id)
       DO UPDATE SET completed=EXCLUDED.completed,review_needed=EXCLUDED.review_needed,completed_at=EXCLUDED.completed_at,updated_at=NOW()`,
      [user.id,exam,subject,topicId,completed,reviewNeeded]
    );
  }

  return {alreadySeeded:false};
}

export default async function handler(req,res){
  if(!onlyMethods(req,res,['GET','POST']))return;
  const user=await requireUser(req,res,{admin:true});
  if(!user)return;

  if(req.method==='GET'){
    const r=await query(`SELECT id,code,package_key,duration_days,assigned_email,used_by,used_at,created_at FROM yks2_license_codes ORDER BY id DESC LIMIT 100`);
    return res.status(200).json({codes:r.rows});
  }

  const action=text(req.body?.action,30);

  if(action==='previewPlan'){
    const plan=text(req.body?.plan,20);
    if(!['none','basic','ai_pro'].includes(plan))return res.status(400).json({error:'Geçersiz test paketi.'});
    res.setHeader('Set-Cookie',adminPreviewCookie(plan));
    return res.status(200).json({ok:true,plan});
  }

  if(action==='seedDemo'){
    const result=await seedAdminDemo(user);
    return res.status(200).json({ok:true,...result});
  }

  if(action==='generateCode'){
    const packageKey=text(req.body?.packageKey,40);
    const assignedEmail=text(req.body?.assignedEmail,180).toLowerCase();
    const count=int(req.body?.count,1,20)||1;
    const pkg=LICENSE_PACKAGES[packageKey];
    if(!pkg)return res.status(400).json({error:'Geçersiz paket.'});

    const codes=[];
    for(let i=0;i<count;i++){
      const code=makeCode();
      const r=await query(
        `INSERT INTO yks2_license_codes(code,package_key,duration_days,assigned_email)
         VALUES($1,$2,$3,$4) RETURNING code`,
        [code,packageKey,pkg.durationDays,assignedEmail||null]
      );
      codes.push(r.rows[0].code);
    }
    return res.status(201).json({codes});
  }

  if(action==='setPlan'){
    const email=text(req.body?.email,180).toLowerCase();
    const plan=text(req.body?.plan,20);
    const days=int(req.body?.days,1,3650)||30;
    if(!email||!['none','basic','ai_pro'].includes(plan))return res.status(400).json({error:'Bilgileri kontrol et.'});
    const expiry=plan==='none'?null:new Date(Date.now()+days*86400000);
    const r=await query(
      `UPDATE yks2_users SET plan=$1,plan_expires_at=$2,updated_at=NOW() WHERE email=$3
       RETURNING id,email,plan,plan_expires_at`,
      [plan,expiry,email]
    );
    if(!r.rows.length)return res.status(404).json({error:'Kullanıcı bulunamadı.'});
    return res.status(200).json({user:r.rows[0]});
  }

  return res.status(400).json({error:'Geçersiz admin işlemi.'});
}
