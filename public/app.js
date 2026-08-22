const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
const root = $('#pageRoot');

const state = {
  user: null,
  access: null,
  page: 'today',
  curriculum: null,
  progress: [],
  resources: [],
  timer: { total: 25*60, left: 25*60, running: false, interval: null, preset: 25 }
};

const titles = {
  today:['BUGÜN','Kontrol Merkezi'], curriculum:['MÜFREDAT','2026 YKS Müfredat Takibi'], planner:['PLAN','Çalışma Programı'],
  exams:['DENEME','Deneme Takibi'], questions:['SORU','Soru Takibi'], resources:['KAYNAK','Kaynak Takibi'], archive:['ARŞİV','Dijital Yanlış Soru Arşivi'],
  review:['TEKRAR','Tekrar Listesi'], performance:['ANALİZ','Ders Bazlı Performans'], focus:['ODAK','Pomodoro & Çalışma'], sleep:['UYKU','Uyku Takibi'],
  badges:['ROZET','Başarı Rozetleri'], aiCoach:['AI PRO','AI Koç'], flashcards:['AI PRO','Flashcard'], testLab:['AI PRO','Test Lab'], aiProgram:['AI PRO','AI Çalışma Programı'], solver:['AI PRO','Soru Çözücü'], wrongAnalysis:['AI PRO','Yanlış Analizi'], duels:['DÜELLO','Düello & Liderlik'], settings:['HESAP','Ayarlar & Paket']
};

function esc(v=''){return String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
function fmtDate(v){if(!v)return '—';try{return new Intl.DateTimeFormat('tr-TR',{day:'2-digit',month:'short',year:'numeric'}).format(new Date(v));}catch{return v;}}
function todayISO(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function trackLabel(v){return ({sayisal:'Sayısal',esit_agirlik:'Eşit Ağırlık',sozel:'Sözel'})[v]||v;}
function planLabel(v){return ({none:'Paket Yok',basic:'Temel',ai_pro:'AI Pro'})[v]||v;}
function percent(n){return Math.max(0,Math.min(100,Number(n)||0));}
function progressBar(n, green=false){return `<div class="progress${green?' green':''}"><span style="width:${percent(n)}%"></span></div>`;}
function empty(title,text,icon='◇'){return `<div class="empty"><div class="empty-icon">${icon}</div><strong>${esc(title)}</strong><span>${esc(text)}</span></div>`;}
function formDataObject(form){return Object.fromEntries(new FormData(form).entries());}

function toast(message,type='success'){
  const t=$('#toast');t.textContent=message;t.className=`toast show ${type}`;clearTimeout(toast._t);toast._t=setTimeout(()=>t.className='toast',3200);
}
function loading(btn,on,label){if(!btn)return; if(on){btn.dataset.old=btn.innerHTML;btn.disabled=true;btn.innerHTML='<span class="spinner"></span>';}else{btn.disabled=false;btn.innerHTML=btn.dataset.old||label||'Tamam';}}
async function api(path,options={}){
  const r=await fetch(path,{credentials:'same-origin',...options,headers:{...(options.body?{'Content-Type':'application/json'}:{}),...(options.headers||{})}});
  const ct=r.headers.get('content-type')||'';const data=ct.includes('application/json')?await r.json():{error:await r.text()};
  if(!r.ok){const e=new Error(data.error||`HTTP ${r.status}`);e.code=data.code;e.status=r.status;throw e;}return data;
}

function showAuth(){
  $('#loadingScreen').classList.add('hidden');$('#appView').classList.add('hidden');$('#authView').classList.remove('hidden');
}
function showApp(){
  $('#loadingScreen').classList.add('hidden');$('#authView').classList.add('hidden');$('#appView').classList.remove('hidden');updateShell();
}
function updateShell(){
  const u=state.user,a=state.access||{};
  $('#sidebarName').textContent=u?.name||'Öğrenci';$('#avatar').textContent=(u?.name||'Y').trim().charAt(0).toUpperCase();
  $('#sidebarPlan').textContent=planLabel(a.plan);$('#planBadge').textContent=a.plan==='ai_pro'?'AI PRO':a.plan==='basic'?'TEMEL':'PAKET YOK';
  $('#topGoal').textContent=u?`${u.targetDepartment} · ${Number(u.targetRank||0).toLocaleString('tr-TR')}`:'';
  $$('[data-paid]').forEach(x=>x.classList.toggle('locked',!a.hasPaidAccess));$$('[data-pro]').forEach(x=>x.classList.toggle('locked',!a.isPro));
}
function setPageTitle(page){const [e,t]=titles[page]||['YKS MASTER',''];$('#pageEyebrow').textContent=e;$('#pageTitle').textContent=t;}
function closeMenu(){$('#sidebar').classList.remove('open');$('#sidebarBackdrop').classList.remove('show');}

$('#menuButton').addEventListener('click',()=>{$('#sidebar').classList.add('open');$('#sidebarBackdrop').classList.add('show');});
$('#closeMenu').addEventListener('click',closeMenu);$('#sidebarBackdrop').addEventListener('click',closeMenu);

$('#loginTab').addEventListener('click',()=>{$('#loginTab').classList.add('active');$('#registerTab').classList.remove('active');$('#loginForm').classList.remove('hidden');$('#registerForm').classList.add('hidden');});
$('#registerTab').addEventListener('click',()=>{$('#registerTab').classList.add('active');$('#loginTab').classList.remove('active');$('#registerForm').classList.remove('hidden');$('#loginForm').classList.add('hidden');});

$('#loginForm').addEventListener('submit',async e=>{
  e.preventDefault();const b=e.currentTarget.querySelector('button[type=submit]');loading(b,true);
  try{const f=formDataObject(e.currentTarget),d=await api('/api/auth/login',{method:'POST',body:JSON.stringify(f)});state.user=d.user;state.access=d.access;showApp();await navigate(state.access.hasPaidAccess?'today':'settings');toast('Giriş başarılı.');}
  catch(err){toast(err.message,'error');}finally{loading(b,false,'Giriş Yap');}
});
$('#registerForm').addEventListener('submit',async e=>{
  e.preventDefault();const b=e.currentTarget.querySelector('button[type=submit]');loading(b,true);
  try{const f=formDataObject(e.currentTarget),d=await api('/api/auth/register',{method:'POST',body:JSON.stringify(f)});state.user=d.user;state.access=d.access;showApp();await navigate(state.access.hasPaidAccess?'today':'settings');toast('Hesabın oluşturuldu. Paket kodunu Ayarlar bölümünden etkinleştirebilirsin.');}
  catch(err){toast(err.message,'error');}finally{loading(b,false,'Hesabımı Oluştur');}
});
$('#logoutButton').addEventListener('click',async()=>{try{await api('/api/auth/logout',{method:'POST'});}catch{}state.user=null;state.access=null;state.curriculum=null;state.progress=[];showAuth();});

$('#nav').addEventListener('click',e=>{
  const b=e.target.closest('[data-page]');if(!b)return;const page=b.dataset.page;
  if(b.hasAttribute('data-pro')&&!state.access?.isPro){toast('Bu özellik AI Pro paketine özel.','error');navigate('settings');return;}
  if(b.hasAttribute('data-paid')&&!state.access?.hasPaidAccess){toast('Bu özellik için aktif paket gerekli.','error');navigate('settings');return;}
  navigate(page);closeMenu();
});

async function navigate(page){
  state.page=page;setPageTitle(page);$$('.nav-item').forEach(x=>x.classList.toggle('active',x.dataset.page===page));
  root.innerHTML='<div class="panel"><div class="empty"><span class="spinner"></span><strong>Yükleniyor</strong></div></div>';
  try{
    const fn={today:renderToday,curriculum:renderCurriculum,planner:renderPlanner,exams:renderExams,questions:renderQuestions,resources:renderResources,archive:renderArchive,review:renderReview,performance:renderPerformance,focus:renderFocus,sleep:renderSleep,badges:renderBadges,aiCoach:renderAI,flashcards:renderAI,testLab:renderAI,aiProgram:renderAI,solver:renderAI,wrongAnalysis:renderAI,duels:renderDuels,settings:renderSettings}[page]||renderToday;
    await fn();root.classList.remove('page-enter');void root.offsetWidth;root.classList.add('page-enter');
  }catch(err){console.error(err);if(err.code==='PLAN_REQUIRED'){state.access.hasPaidAccess=false;updateShell();return navigate('settings');}root.innerHTML=`<div class="panel">${empty('Bu bölüm yüklenemedi',err.message,'!')}</div>`;toast(err.message,'error');}
}

async function ensureCurriculum(force=false){
  if(state.curriculum&&!force)return {curriculum:state.curriculum,progress:state.progress};
  const d=await api('/api/curriculum');state.curriculum=d.curriculum;state.progress=d.progress||[];return d;
}
function progressMap(){return new Map(state.progress.map(x=>[`${x.exam}|${x.subject}|${x.topic_id}`,x]));}
function subjectOptions(exam,selected=''){const s=Object.keys(state.curriculum?.[exam]||{});return `<option value="">Ders seç</option>`+s.map(x=>`<option ${x===selected?'selected':''}>${esc(x)}</option>`).join('');}
function topicOptions(exam,subject,selected=''){const t=state.curriculum?.[exam]?.[subject]||[];return `<option value="">Konu seç</option>`+t.map(x=>`<option value="${esc(x.id)}" ${x.id===selected?'selected':''}>${esc(x.name)}</option>`).join('');}
function allSubjects(){return [...new Set(['TYT','AYT'].flatMap(e=>Object.keys(state.curriculum?.[e]||{})))].sort((a,b)=>a.localeCompare(b,'tr'));}
function bindExamSubjectTopic(examSel,subjectSel,topicSel){
  const syncSubject=()=>{subjectSel.innerHTML=subjectOptions(examSel.value);syncTopic();};
  const syncTopic=()=>{if(topicSel)topicSel.innerHTML=topicOptions(examSel.value,subjectSel.value);};
  examSel.addEventListener('change',syncSubject);subjectSel.addEventListener('change',syncTopic);syncSubject();
}

async function renderToday(){
  if(!state.access?.hasPaidAccess)return renderSettings();
  const [d,alerts]=await Promise.all([api('/api/dashboard'),api('/api/alerts')]);state.user=d.user;state.access=d.access;updateShell();
  const plan=d.todayPlan||[],latestBadge=d.latestBadges?.slice(-1)[0],weak=[...(d.performance||[])].filter(x=>x.total>=10).sort((a,b)=>a.successRate-b.successRate)[0];
  root.innerHTML=`
    <section class="hero"><div><span class="eyebrow">HEDEF PROFİLİN</span><h1>${esc(d.user.targetDepartment||'Hedef bölüm')}</h1><p>${esc(d.user.targetUniversity||'Üniversite hedefi belirtilmedi')} · ${esc(d.user.targetCity)} · ${esc(trackLabel(d.user.track))}</p></div><div class="rank-orb"><div><span>Hedef sıralama</span><strong>${Number(d.user.targetRank||0).toLocaleString('tr-TR')}</strong></div></div></section>
    <section class="stats-grid">
      <article class="stat-card"><span>🔥 Günlük seri</span><strong>${d.streak.current} gün</strong><small>En uzun: ${d.streak.longest} gün</small></article>
      <article class="stat-card"><span>◷ Bugün çalışma</span><strong>${d.study.today_minutes} dk</strong><small>Bu hafta ${d.study.week_minutes} dk</small></article>
      <article class="stat-card"><span>◎ Toplam soru</span><strong>${Number(d.questions.total).toLocaleString('tr-TR')}</strong><small>${d.questions.correct} doğru · ${d.questions.wrong} yanlış</small></article>
      <article class="stat-card"><span>⌁ Başarı oranı</span><strong>%${d.questions.successRate}</strong><small>Kayıtlı soru verilerinden</small></article>
      <article class="stat-card"><span>✓ Müfredat</span><strong>%${d.curriculum.overall}</strong><small>TYT %${d.curriculum.TYT.overall} · AYT %${d.curriculum.AYT.overall}</small></article>
    </section>
    <section class="content-grid">
      <article class="panel"><div class="panel-head"><div><span class="eyebrow">BUGÜNÜN PLANI</span><h3>Odak listesi</h3></div><button class="btn soft small" data-go="planner">+ Görev ekle</button></div>
        <div id="todayPlanList" class="list">${plan.length?plan.map(x=>`<div class="list-row ${x.completed?'done':''}" data-plan="${x.id}"><button class="check-btn ${x.completed?'checked':''}" data-toggle-plan="${x.id}">${x.completed?'✓':''}</button><div class="grow"><strong>${esc(x.exam||'TYT')} · ${esc(x.subject)}${x.topic?' · '+esc(x.topic):''}</strong><small>${x.target_minutes} dk ${x.created_by==='ai'?'· AI programı':''}</small></div></div>`).join(''):empty('Bugün için görev yok','Çalışma programından bugüne görev ekleyebilirsin.','✓')}</div>
      </article>
      <article class="panel"><div class="panel-head"><div><span class="eyebrow">AKILLI UYARILAR</span><h3>Dikkat etmen gerekenler</h3></div></div>
        ${(alerts.items||[]).map(a=>`<div class="notice ${a.level}"><span class="notice-dot"></span><p><strong>${esc(a.title)}</strong>${esc(a.text)}</p></div>`).join('')}
      </article>
    </section>
    <section class="content-grid" style="margin-top:15px">
      <article class="panel"><div class="panel-head"><div><span class="eyebrow">MÜFREDAT İLERLEMESİ</span><h3>TYT / AYT</h3></div><button class="btn small" data-go="curriculum">Detay</button></div>
        <div class="progress-pair"><div class="progress-box"><h4>TYT · %${d.curriculum.TYT.overall}</h4>${progressBar(d.curriculum.TYT.overall)}</div><div class="progress-box"><h4>AYT · %${d.curriculum.AYT.overall}</h4>${progressBar(d.curriculum.AYT.overall,true)}</div></div>
      </article>
      <article class="panel"><div class="panel-head"><div><span class="eyebrow">KISA ÖZET</span><h3>Son durum</h3></div></div>
        ${weak?`<div class="notice warning"><span class="notice-dot"></span><p><strong>Öncelik: ${esc(weak.subject)}</strong>Kayıtlı sorularda başarı %${weak.successRate}.</p></div>`:''}
        ${d.lastExam?`<div class="notice"><span class="notice-dot"></span><p><strong>Son deneme: ${esc(d.lastExam.exam_name)}</strong>${esc(d.lastExam.exam_type)} · ${Number(d.lastExam.total_net).toFixed(2)} net · ${fmtDate(d.lastExam.exam_date)}</p></div>`:''}
        ${latestBadge?`<div class="notice success"><span class="notice-dot"></span><p><strong>${esc(latestBadge.label)}</strong>Son kazanılan rozetlerinden biri.</p></div>`:''}
        ${!d.lastExam&&!latestBadge&&!weak?`<div class="notice"><span class="notice-dot"></span><p>Veri ekledikçe bu alan kişisel hale gelecek.</p></div>`:''}
      </article>
    </section>`;
  $$('[data-go]',root).forEach(b=>b.onclick=()=>navigate(b.dataset.go));
  $$('[data-toggle-plan]',root).forEach(b=>b.onclick=async()=>{try{await api('/api/planner',{method:'POST',body:JSON.stringify({action:'toggle',id:Number(b.dataset.togglePlan)})});await renderToday();}catch(e){toast(e.message,'error');}});
}

async function renderCurriculum(){
  await ensureCurriculum(true);let exam='TYT';
  const draw=()=>{
    const pm=progressMap(),subjects=state.curriculum[exam]||{};
    const overall=Object.entries(subjects).reduce((acc,[subject,topics])=>{const done=topics.filter(t=>pm.get(`${exam}|${subject}|${t.id}`)?.completed).length;acc.done+=done;acc.total+=topics.length;return acc;},{done:0,total:0});
    root.innerHTML=`<div class="section-title"><div><span class="eyebrow">RESMÎ 2026 KAPSAMI</span><h1>${exam} müfredatı</h1><p>${esc(state.curriculum.meta?.note||'')}</p></div><div class="tabs"><button data-exam="TYT" class="${exam==='TYT'?'active':''}">TYT</button><button data-exam="AYT" class="${exam==='AYT'?'active':''}">AYT</button></div></div>
      <div class="panel" style="margin-bottom:14px"><div class="progress-meta"><span>${exam} genel ilerleme</span><strong>%${overall.total?Math.round(overall.done/overall.total*100):0}</strong></div>${progressBar(overall.total?overall.done/overall.total*100:0)}</div>
      <div class="subject-grid">${Object.entries(subjects).map(([subject,topics])=>{const done=topics.filter(t=>pm.get(`${exam}|${subject}|${t.id}`)?.completed).length,pct=topics.length?Math.round(done/topics.length*100):0;return `<details class="subject-card"><summary><div class="subject-summary"><strong>${esc(subject)}</strong>${progressBar(pct)}</div><span class="percent-chip">%${pct}</span></summary><div class="topic-list">${topics.map(t=>{const p=pm.get(`${exam}|${subject}|${t.id}`)||{};return `<div class="topic-row"><label><input type="checkbox" data-topic-check data-exam="${exam}" data-subject="${esc(subject)}" data-topic="${esc(t.id)}" ${p.completed?'checked':''}><span>${esc(t.name)}</span></label><button class="review-btn ${p.review_needed?'active':''}" title="Tekrar listesine ekle" data-review data-exam="${exam}" data-subject="${esc(subject)}" data-topic="${esc(t.id)}">↻</button></div>`}).join('')}</div></details>`}).join('')}</div>`;
    $$('[data-exam]',root).forEach(b=>b.onclick=()=>{exam=b.dataset.exam;draw();});
    $$('[data-topic-check]',root).forEach(ch=>ch.onchange=async()=>{const key=`${ch.dataset.exam}|${ch.dataset.subject}|${ch.dataset.topic}`,old=progressMap().get(key)||{};try{await api('/api/curriculum',{method:'POST',body:JSON.stringify({exam:ch.dataset.exam,subject:ch.dataset.subject,topicId:ch.dataset.topic,completed:ch.checked,reviewNeeded:Boolean(old.review_needed)})});await ensureCurriculum(true);draw();}catch(e){ch.checked=!ch.checked;toast(e.message,'error');}});
    $$('[data-review]',root).forEach(b=>b.onclick=async()=>{const key=`${b.dataset.exam}|${b.dataset.subject}|${b.dataset.topic}`,old=progressMap().get(key)||{};try{await api('/api/curriculum',{method:'POST',body:JSON.stringify({exam:b.dataset.exam,subject:b.dataset.subject,topicId:b.dataset.topic,completed:Boolean(old.completed),reviewNeeded:!old.review_needed})});await ensureCurriculum(true);draw();toast(!old.review_needed?'Tekrar listesine eklendi.':'Tekrar listesinden çıkarıldı.');}catch(e){toast(e.message,'error');}});
  };draw();
}

async function renderPlanner(){
  await ensureCurriculum();const d=await api(`/api/planner?from=${todayISO()}`);const items=d.items||[];
  root.innerHTML=`<div class="section-title"><div><span class="eyebrow">MANUEL PLANLAMA</span><h1>Çalışma Programı</h1><p>Temel pakette programını kendin oluşturursun. Ders ve konu seçimleri alanına uygun 2026 YKS takip listesinden gelir. AI ile program oluşturma yalnız AI Pro'dadır.</p></div>${state.access.isPro?'<button class="btn soft" data-go-ai-program>✦ AI ile program oluştur</button>':''}</div>
  <div class="form-panel"><article class="panel"><div class="panel-head"><div><span class="eyebrow">YENİ GÖREV</span><h3>Programa ekle</h3></div></div><form id="planForm" class="compact-form">
    <div class="field-row"><label>Tarih<input name="planDate" type="date" value="${todayISO()}" required></label><label>Hedef süre (dk)<input name="targetMinutes" type="number" min="1" max="720" value="45" required></label></div>
    <div class="field-row"><label>Sınav<select id="planExam" name="exam"><option>TYT</option><option>AYT</option></select></label><label>Ders<select id="planSubject" name="subject" required></select></label></div>
    <label>Konu<select id="planTopic" name="topicId"><option value="">Konu seç</option></select></label><label>Not<textarea name="note" placeholder="Bu görev için küçük not…"></textarea></label>
    <button class="btn primary" type="submit">Programa Ekle</button></form></article>
    <article class="panel"><div class="panel-head"><div><span class="eyebrow">ÖNÜMÜZDEKİ 14 GÜN</span><h3>Görevlerin</h3></div></div><div class="list">${items.length?items.map(x=>`<div class="list-row ${x.completed?'done':''}"><button class="check-btn ${x.completed?'checked':''}" data-plan-toggle="${x.id}">${x.completed?'✓':''}</button><div class="grow"><strong>${fmtDate(x.plan_date)} · ${esc(x.exam||'TYT')} · ${esc(x.subject)}${x.topic?' · '+esc(x.topic):''}</strong><small>${x.target_minutes} dk${x.note?' · '+esc(x.note):''}${x.created_by==='ai'?' · AI':''}</small></div><button class="btn danger small" data-plan-delete="${x.id}">Sil</button></div>`).join(''):empty('Plan boş','İlk görevini soldaki formdan ekle.','▦')}</div></article></div>`;
  bindExamSubjectTopic($('#planExam',root),$('#planSubject',root),$('#planTopic',root));
  $('#planForm',root).onsubmit=async e=>{e.preventDefault();const f=formDataObject(e.currentTarget),topicObj=(state.curriculum[f.exam]?.[f.subject]||[]).find(t=>t.id===f.topicId);const payload={...f,topic:topicObj?.name||''};delete payload.topicId;const b=e.currentTarget.querySelector('button[type=submit]');loading(b,true);try{await api('/api/planner',{method:'POST',body:JSON.stringify(payload)});toast('Görev eklendi.');await renderPlanner();}catch(err){toast(err.message,'error');}finally{loading(b,false,'Programa Ekle');}};
  $$('[data-plan-toggle]',root).forEach(b=>b.onclick=async()=>{await api('/api/planner',{method:'POST',body:JSON.stringify({action:'toggle',id:Number(b.dataset.planToggle)})});renderPlanner();});
  $$('[data-plan-delete]',root).forEach(b=>b.onclick=async()=>{if(!confirm('Bu görevi silmek istiyor musun?'))return;await api(`/api/planner?id=${b.dataset.planDelete}`,{method:'DELETE'});renderPlanner();});
  $('[data-go-ai-program]',root)?.addEventListener('click',()=>navigate('aiProgram'));
}

async function renderExams(){
  await ensureCurriculum();const d=await api('/api/exams');let exam='TYT';
  const formSubjects=()=>Object.keys(state.curriculum[exam]||{}).map(s=>`<div class="list-row"><div class="grow"><strong>${esc(s)}</strong><small>Doğru / Yanlış / Boş</small></div><div class="triple" style="width:min(340px,60%)"><input data-exam-correct="${esc(s)}" type="number" min="0" placeholder="D"><input data-exam-wrong="${esc(s)}" type="number" min="0" placeholder="Y"><input data-exam-blank="${esc(s)}" type="number" min="0" placeholder="B"></div></div>`).join('');
  root.innerHTML=`<div class="section-title"><div><span class="eyebrow">NET GELİŞİMİ</span><h1>Deneme Takibi</h1><p>TYT ve alanına uygun AYT derslerini ayrı ayrı kaydet.</p></div></div><div class="form-panel"><article class="panel"><form id="examForm" class="compact-form"><div class="field-row"><label>Sınav<select id="examType" name="examType"><option>TYT</option><option>AYT</option></select></label><label>Tarih<input name="examDate" type="date" value="${todayISO()}" required></label></div><label>Deneme adı<input name="examName" required placeholder="Örn. Türkiye Geneli 3"></label><div id="examSubjectRows" class="list">${formSubjects()}</div><button class="btn primary" type="submit">Denemeyi Kaydet</button></form></article>
  <article class="panel"><div class="panel-head"><div><span class="eyebrow">GEÇMİŞ</span><h3>Son denemeler</h3></div></div><div class="list">${(d.items||[]).length?d.items.map(x=>`<div class="list-row"><div class="grow"><strong>${esc(x.exam_name)} · ${esc(x.exam_type)}</strong><small>${fmtDate(x.exam_date)}</small></div><span class="tag">${Number(x.total_net).toFixed(2)} net</span><button class="btn danger small" data-exam-delete="${x.id}">Sil</button></div>`).join(''):empty('Henüz deneme yok','İlk deneme sonucunu kaydet.','▥')}</div></article></div>`;
  $('#examType',root).onchange=e=>{exam=e.target.value;$('#examSubjectRows',root).innerHTML=formSubjects();};
  $('#examForm',root).onsubmit=async e=>{e.preventDefault();const f=formDataObject(e.currentTarget),details={};Object.keys(state.curriculum[f.examType]||{}).forEach(s=>{const correctEl=$$('[data-exam-correct]',root).find(el=>el.dataset.examCorrect===s),wrongEl=$$('[data-exam-wrong]',root).find(el=>el.dataset.examWrong===s),blankEl=$$('[data-exam-blank]',root).find(el=>el.dataset.examBlank===s);details[s]={correct:Number(correctEl?.value||0),wrong:Number(wrongEl?.value||0),blank:Number(blankEl?.value||0)}});const b=e.currentTarget.querySelector('button[type=submit]');loading(b,true);try{await api('/api/exams',{method:'POST',body:JSON.stringify({...f,details})});toast('Deneme kaydedildi.');renderExams();}catch(err){toast(err.message,'error');}finally{loading(b,false,'Denemeyi Kaydet');}};
  $$('[data-exam-delete]',root).forEach(b=>b.onclick=async()=>{if(!confirm('Deneme kaydını silmek istiyor musun?'))return;await api(`/api/exams?id=${b.dataset.examDelete}`,{method:'DELETE'});renderExams();});
}

async function renderQuestions(){
  await ensureCurriculum();const [d,res]=await Promise.all([api('/api/questions'),api('/api/resources')]);state.resources=res.items||[];
  root.innerHTML=`<div class="section-title"><div><span class="eyebrow">DOĞRU · YANLIŞ · BOŞ</span><h1>Soru Takibi</h1><p>Sayısal, Eşit Ağırlık ve Sözel için ders listeleri alanına göre otomatik gelir. Kaynak seçersen yalnız aynı TYT/AYT dersiyle eşleşen kaynaklar gösterilir.</p></div></div><div class="form-panel"><article class="panel"><form id="questionForm" class="compact-form"><div class="field-row"><label>Sınav<select id="qExam" name="exam"><option>TYT</option><option>AYT</option></select></label><label>Tarih<input name="logDate" type="date" value="${todayISO()}"></label></div><label>Ders<select id="qSubject" name="subject" required></select></label><label>Konu<select id="qTopic" name="topicId"></select></label><label>Kaynak<select id="qSource" name="sourceId"><option value="">Kaynak seçmeden kaydet</option></select></label><div class="triple"><label>Doğru<input name="correct" type="number" min="0" value="0"></label><label>Yanlış<input name="wrong" type="number" min="0" value="0"></label><label>Boş<input name="blank" type="number" min="0" value="0"></label></div><button class="btn primary" type="submit">Soru Kaydını Ekle</button></form></article>
  <article class="panel"><div class="panel-head"><div><span class="eyebrow">SON KAYITLAR</span><h3>Çalışma geçmişi</h3></div></div><div class="table-wrap">${(d.items||[]).length?`<table class="data-table"><thead><tr><th>Tarih</th><th>Sınav</th><th>Ders / Konu</th><th>D</th><th>Y</th><th>B</th><th>Kaynak</th><th></th></tr></thead><tbody>${d.items.map(x=>`<tr><td>${fmtDate(x.log_date)}</td><td><span class="tag">${esc(x.exam)}</span></td><td><strong>${esc(x.subject)}</strong><br><small>${esc(x.topic||'—')}</small></td><td>${x.correct_count}</td><td>${x.wrong_count}</td><td>${x.blank_count}</td><td>${esc(x.source_name||'—')}</td><td><button class="btn danger small" data-q-delete="${x.id}">Sil</button></td></tr>`).join('')}</tbody></table>`:empty('Henüz soru kaydı yok','İlk soru çalışmanı ekle.','◎')}</div></article></div>`;
  const qExam=$('#qExam',root),qSubject=$('#qSubject',root),qTopic=$('#qTopic',root),qSource=$('#qSource',root);
  const syncSources=()=>{const chosen=qSource.value;qSource.innerHTML='<option value="">Kaynak seçmeden kaydet</option>'+state.resources.filter(x=>x.exam===qExam.value&&x.subject===qSubject.value).map(x=>`<option value="${x.id}" ${String(x.id)===chosen?'selected':''}>${esc(x.name)}</option>`).join('');};
  bindExamSubjectTopic(qExam,qSubject,qTopic);qExam.addEventListener('change',syncSources);qSubject.addEventListener('change',syncSources);syncSources();
  $('#questionForm',root).onsubmit=async e=>{e.preventDefault();const f=formDataObject(e.currentTarget),topicObj=(state.curriculum[f.exam]?.[f.subject]||[]).find(t=>t.id===f.topicId);const payload={...f,topic:topicObj?.name||'',correct:Number(f.correct||0),wrong:Number(f.wrong||0),blank:Number(f.blank||0),sourceId:f.sourceId?Number(f.sourceId):null};const b=e.currentTarget.querySelector('button[type=submit]');loading(b,true);try{await api('/api/questions',{method:'POST',body:JSON.stringify(payload)});toast('Soru kaydı eklendi.');renderQuestions();}catch(err){toast(err.message,'error');}finally{loading(b,false,'Soru Kaydını Ekle');}};
  $$('[data-q-delete]',root).forEach(b=>b.onclick=async()=>{if(!confirm('Bu soru kaydını silmek istiyor musun?'))return;await api(`/api/questions?id=${b.dataset.qDelete}`,{method:'DELETE'});renderQuestions();});
}

async function renderResources(){
  await ensureCurriculum();const d=await api('/api/resources');state.resources=d.items||[];
  const resourceOptions=state.resources.map(x=>`<option value="${x.id}">${esc(x.name)} · ${esc(x.exam)} ${esc(x.subject)}</option>`).join('');
  root.innerHTML=`<div class="section-title"><div><span class="eyebrow">KİTAP & KAYNAK</span><h1>Kaynak Takibi</h1><p>Kaynağını TYT/AYT ve ders ile tanımla. Doğru, yanlış ve boşlarını burada kaydettiğinde hem kaynak ilerlemesi hem soru performansın birlikte güncellenir.</p></div></div>
  <div class="content-grid"><article class="panel"><div class="panel-head"><div><span class="eyebrow">YENİ KAYNAK</span><h3>Kitap ekle</h3></div></div><form id="resourceForm" class="compact-form"><label>Kaynak adı<input name="name" required placeholder="Örn. 3D TYT Matematik"></label><div class="field-row"><label>Sınav<select id="rExam" name="exam"><option>TYT</option><option>AYT</option></select></label><label>Ders<select id="rSubject" name="subject" required></select></label></div><label>Toplam soru <span class="muted-inline">(biliyorsan)</span><input name="totalQuestions" type="number" min="0" placeholder="1200"></label><button class="btn primary" type="submit">Kaynağı Ekle</button></form></article>
  <article class="panel"><div class="panel-head"><div><span class="eyebrow">KAYNAK ÇALIŞMASI</span><h3>Doğru · yanlış kaydet</h3></div></div>${state.resources.length?`<form id="resourceLogForm" class="compact-form"><label>Kaynak<select id="resourceLogSource" name="sourceId" required><option value="">Kaynak seç</option>${resourceOptions}</select></label><label>Konu<select id="resourceLogTopic" name="topicId"><option value="">Önce kaynak seç</option></select></label><label>Tarih<input name="logDate" type="date" value="${todayISO()}"></label><div class="triple"><label>Doğru<input name="correct" type="number" min="0" value="0"></label><label>Yanlış<input name="wrong" type="number" min="0" value="0"></label><label>Boş<input name="blank" type="number" min="0" value="0"></label></div><button class="btn soft" type="submit">Çalışmayı Kaydet</button></form>`:empty('Önce bir kaynak ekle','Doğru ve yanlış kaydı için yukarıdan ilk kitabını oluştur.','▤')}</article></div>
  <div class="card-grid" style="margin-top:15px">${state.resources.length?state.resources.map(x=>{const pct=x.total_questions?Math.min(100,Math.round(Number(x.solved_questions||0)/Number(x.total_questions)*100)):0;return `<article class="resource-card"><div class="panel-head"><div><h4>${esc(x.name)}</h4><span class="resource-meta">${esc(x.exam)} · ${esc(x.subject)}</span></div><span class="tag ${x.completed?'green':''}">${x.completed?'Tamamlandı':'Devam'}</span></div><strong>${Number(x.solved_questions||0).toLocaleString('tr-TR')} soru</strong>${x.total_questions?`${progressBar(pct)}<div class="progress-meta"><span>${x.solved_questions}/${x.total_questions}</span><b>%${pct}</b></div>`:`<p class="resource-meta">Toplam soru sayısı girilmedi.</p>`}<div class="resource-meta" style="margin-top:9px">${x.correct_count} doğru · ${x.wrong_count} yanlış · ${x.blank_count} boş</div><div class="card-actions"><button class="btn ${x.completed?'soft':'success'} small" data-resource-toggle="${x.id}">${x.completed?'Devama Al':'Tamamlandı'}</button><button class="btn danger small" data-resource-delete="${x.id}">Sil</button></div></article>`}).join(''):empty('Henüz kaynak yok','Kullandığın ilk kitabı ekle.','▤')}</div>`;
  const rExam=$('#rExam',root),rSubject=$('#rSubject',root);const syncResourceSubject=()=>{rSubject.innerHTML=subjectOptions(rExam.value);};rExam.addEventListener('change',syncResourceSubject);syncResourceSubject();
  $('#resourceForm',root).onsubmit=async e=>{e.preventDefault();const f=formDataObject(e.currentTarget),b=e.currentTarget.querySelector('button[type=submit]');loading(b,true);try{await api('/api/resources',{method:'POST',body:JSON.stringify({...f,totalQuestions:f.totalQuestions?Number(f.totalQuestions):null})});toast('Kaynak eklendi.');renderResources();}catch(err){toast(err.message,'error');}finally{loading(b,false,'Kaynağı Ekle');}};
  const logForm=$('#resourceLogForm',root);
  if(logForm){
    const source=$('#resourceLogSource',root),topic=$('#resourceLogTopic',root);
    const syncResourceTopic=()=>{const r=state.resources.find(x=>String(x.id)===source.value);topic.innerHTML=r?topicOptions(r.exam,r.subject):'<option value="">Önce kaynak seç</option>';};source.addEventListener('change',syncResourceTopic);syncResourceTopic();
    logForm.onsubmit=async e=>{e.preventDefault();const f=formDataObject(e.currentTarget),r=state.resources.find(x=>String(x.id)===String(f.sourceId));if(!r)return toast('Kaynak seç.','error');const topicObj=(state.curriculum[r.exam]?.[r.subject]||[]).find(t=>t.id===f.topicId);const payload={exam:r.exam,subject:r.subject,topic:topicObj?.name||'',sourceId:Number(r.id),logDate:f.logDate,correct:Number(f.correct||0),wrong:Number(f.wrong||0),blank:Number(f.blank||0)};const b=e.currentTarget.querySelector('button[type=submit]');loading(b,true);try{await api('/api/questions',{method:'POST',body:JSON.stringify(payload)});toast('Kaynak çalışması kaydedildi.');renderResources();}catch(err){toast(err.message,'error');}finally{loading(b,false,'Çalışmayı Kaydet');}};
  }
  $$('[data-resource-toggle]',root).forEach(b=>b.onclick=async()=>{await api('/api/resources',{method:'POST',body:JSON.stringify({action:'toggle',id:Number(b.dataset.resourceToggle)})});renderResources();});
  $$('[data-resource-delete]',root).forEach(b=>b.onclick=async()=>{if(!confirm('Bu kaynağı silmek istiyor musun? Bağlı soru kayıtları silinmez.'))return;await api(`/api/resources?id=${b.dataset.resourceDelete}`,{method:'DELETE'});renderResources();});
}

async function compressImage(file,max=1200,quality=.76){
  if(!file)throw new Error('Fotoğraf seç.');if(!file.type.startsWith('image/'))throw new Error('Yalnızca görsel dosyası yükleyebilirsin.');
  const dataUrl=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file)});
  const img=await new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=reject;i.src=dataUrl});
  const scale=Math.min(1,max/Math.max(img.width,img.height)),w=Math.max(1,Math.round(img.width*scale)),h=Math.max(1,Math.round(img.height*scale));
  const c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d');ctx.drawImage(img,0,0,w,h);return c.toDataURL('image/jpeg',quality);
}

async function renderArchive(){
  await ensureCurriculum();const d=await api('/api/archive');const items=d.items||[],subjects=allSubjects();
  const card=x=>`<article class="archive-card ${x.resolved?'resolved':''}" data-archive-subject="${esc(x.subject)}"><img class="archive-img" src="/api/archive?image=${x.id}" alt="${esc(x.subject)} yanlış soru"><div class="panel-head"><div><h4>${esc(x.subject)}${x.topic?' · '+esc(x.topic):''}</h4><span class="archive-meta">${esc(x.exam)} · ${fmtDate(x.created_at)}</span></div>${x.favorite?'<span class="favorite-star">★</span>':''}</div>${x.source_name?`<p class="archive-meta">Kaynak: ${esc(x.source_name)}</p>`:''}${x.note?`<p class="archive-meta">${esc(x.note)}</p>`:''}<div class="card-actions"><button class="btn small" data-archive-fav="${x.id}">${x.favorite?'★ Favori':'☆ Favori'}</button><button class="btn small ${x.resolved?'success':''}" data-archive-resolved="${x.id}">${x.resolved?'✓ Çözüldü':'Çözüldü'}</button>${state.access.isPro?`<button class="btn soft small" data-archive-solve="${x.id}">✦ AI ile çöz</button>`:'<button class="btn small" disabled>AI çözüm · PRO</button>'}<button class="btn danger small" data-archive-delete="${x.id}">Sil</button></div></article>`;
  const groups=filter=>{
    const visible=filter?items.filter(x=>x.subject===filter):items;
    if(!visible.length)return empty(filter?'Bu derste soru yok':'Arşiv boş',filter?'Bu derse ait yanlış soru eklediğinde burada görünecek.':'İlk yanlış soru fotoğrafını ekle.','◫');
    const by=new Map();for(const x of visible){if(!by.has(x.subject))by.set(x.subject,[]);by.get(x.subject).push(x);}
    return [...by.entries()].sort(([a],[b])=>a.localeCompare(b,'tr')).map(([subject,rows])=>`<section class="archive-group"><div class="archive-group-head"><div><span class="eyebrow">DERS ARŞİVİ</span><h3>${esc(subject)}</h3></div><span class="tag">${rows.length} soru</span></div><div class="card-grid">${rows.map(card).join('')}</div></section>`).join('');
  };
  root.innerHTML=`<div class="section-title"><div><span class="eyebrow">DİJİTAL ARŞİV</span><h1>Yanlış Soru Arşivi</h1><p>Yanlış yaptığın soruların fotoğrafını ders ve konuya göre sakla. Arşiv ders ders ayrılır; AI ile çözme yalnız AI Pro'da açıktır.</p></div></div>
  <div class="form-panel"><article class="panel"><form id="archiveForm" class="compact-form"><div class="field-row"><label>Sınav<select id="aExam" name="exam"><option>TYT</option><option>AYT</option></select></label><label>Ders<select id="aSubject" name="subject" required></select></label></div><label>Konu<select id="aTopic" name="topicId"></select></label><label>Kaynak / deneme<input name="sourceName" placeholder="Örn. Bilgi Sarmal Deneme 4"></label><label>Not<textarea name="note" placeholder="Nerede takıldım? Sonra neye bakmalıyım?"></textarea></label><label>Soru fotoğrafı<input id="archiveImage" type="file" accept="image/*" required></label><button class="btn primary" type="submit">Arşive Kaydet</button></form></article>
  <article><div class="panel archive-filter"><div><span class="eyebrow">DERS FİLTRESİ</span><h3>Arşivi ders ders görüntüle</h3></div><label>Ders<select id="archiveFilter"><option value="">Tüm dersler</option>${subjects.map(s=>`<option value="${esc(s)}">${esc(s)}</option>`).join('')}</select></label></div><div id="archiveGroups">${groups('')}</div></article></div>`;
  bindExamSubjectTopic($('#aExam',root),$('#aSubject',root),$('#aTopic',root));
  $('#archiveFilter',root).onchange=e=>{$('#archiveGroups',root).innerHTML=groups(e.target.value);};
  $('#archiveForm',root).onsubmit=async e=>{e.preventDefault();const f=formDataObject(e.currentTarget),b=e.currentTarget.querySelector('button[type=submit]');loading(b,true);try{const imageData=await compressImage($('#archiveImage',root).files[0]);const topic=(state.curriculum[f.exam]?.[f.subject]||[]).find(t=>t.id===f.topicId);await api('/api/archive',{method:'POST',body:JSON.stringify({...f,topic:topic?.name||'',imageData,mimeType:'image/jpeg'})});toast('Soru arşive eklendi.');renderArchive();}catch(err){toast(err.message,'error');}finally{loading(b,false,'Arşive Kaydet');}};
  $('#archiveGroups',root).onclick=async e=>{
    const fav=e.target.closest('[data-archive-fav]'),resolved=e.target.closest('[data-archive-resolved]'),del=e.target.closest('[data-archive-delete]'),solve=e.target.closest('[data-archive-solve]');
    try{
      if(fav){await api('/api/archive',{method:'POST',body:JSON.stringify({action:'toggleFavorite',id:Number(fav.dataset.archiveFav)})});return renderArchive();}
      if(resolved){await api('/api/archive',{method:'POST',body:JSON.stringify({action:'toggleResolved',id:Number(resolved.dataset.archiveResolved)})});return renderArchive();}
      if(del){if(!confirm('Bu soru fotoğrafını arşivden silmek istiyor musun?'))return;await api(`/api/archive?id=${del.dataset.archiveDelete}`,{method:'DELETE'});return renderArchive();}
      if(solve){const r=await fetch(`/api/archive?image=${solve.dataset.archiveSolve}`,{credentials:'same-origin'});if(!r.ok)throw new Error('Soru görseli alınamadı.');const blob=await r.blob();state.solveImage=await new Promise((resolve,reject)=>{const fr=new FileReader();fr.onload=()=>resolve(fr.result);fr.onerror=reject;fr.readAsDataURL(blob)});return navigate('solver');}
    }catch(err){toast(err.message,'error');}
  };
}

async function renderReview(){
  await ensureCurriculum(true);const pm=progressMap();const reviews=state.progress.filter(x=>x.review_needed).map(p=>{const topic=state.curriculum[p.exam]?.[p.subject]?.find(t=>t.id===p.topic_id);return {...p,topicName:topic?.name||p.topic_id};});
  root.innerHTML=`<div class="section-title"><div><span class="eyebrow">GERİ DÖNÜŞ</span><h1>Tekrar Listesi</h1><p>Müfredatta ↻ ile işaretlediğin konular burada toplanır.</p></div><span class="tag yellow">${reviews.length} konu</span></div><div class="panel"><div class="list">${reviews.length?reviews.map(x=>`<div class="list-row"><div class="grow"><strong>${esc(x.subject)} · ${esc(x.topicName)}</strong><small>${esc(x.exam)} ${x.completed?'· konu tamamlandı':''}</small></div><button class="btn success small" data-review-done data-exam="${x.exam}" data-subject="${esc(x.subject)}" data-topic="${esc(x.topic_id)}">Tekrarı bitir</button></div>`).join(''):empty('Tekrar bekleyen konu yok','Müfredatta zorlandığın konulara ↻ işareti koyabilirsin.','↻')}</div></div>`;
  $$('[data-review-done]',root).forEach(b=>b.onclick=async()=>{const old=pm.get(`${b.dataset.exam}|${b.dataset.subject}|${b.dataset.topic}`)||{};await api('/api/curriculum',{method:'POST',body:JSON.stringify({exam:b.dataset.exam,subject:b.dataset.subject,topicId:b.dataset.topic,completed:Boolean(old.completed),reviewNeeded:false})});await renderReview();toast('Tekrar listesinden çıkarıldı.');});
}

async function renderPerformance(){
  const [q,e]=await Promise.all([api('/api/questions?mode=performance'),api('/api/exams')]);const perf=q.performance||[],exams=e.items||[];
  root.innerHTML=`<div class="section-title"><div><span class="eyebrow">DERS BAZLI GÖRÜNÜM</span><h1>Performans</h1><p>Başarı oranları kendi girdiğin soru kayıtlarından hesaplanır; AI analizi değildir.</p></div>${state.access.isPro?'<button class="btn soft" data-wrong-analysis>✦ AI Yanlış Analizi</button>':''}</div>
  <div class="content-grid"><article class="panel"><div class="panel-head"><div><span class="eyebrow">SORU PERFORMANSI</span><h3>Dersler</h3></div></div><div class="performance-list">${perf.length?perf.map(x=>{const cls=x.successRate>=80?'good':x.successRate>=60?'mid':'low';return `<div class="performance-row"><div><strong>${esc(x.subject)}</strong><small>${esc(x.exam)} · ${x.total} soru</small></div><div>${progressBar(x.successRate,x.successRate>=80)}</div><div class="score ${cls}">%${x.successRate}</div></div>`}).join(''):empty('Performans verisi yok','Soru Takibi bölümüne kayıt ekledikçe burada ders bazlı sonuçlar oluşur.','⌁')}</div></article>
  <article class="panel"><div class="panel-head"><div><span class="eyebrow">DENEME TRENDİ</span><h3>Son 8 deneme</h3></div></div><div class="list">${exams.length?exams.slice(0,8).map(x=>`<div class="list-row"><div class="grow"><strong>${esc(x.exam_name)}</strong><small>${fmtDate(x.exam_date)} · ${esc(x.exam_type)}</small></div><span class="tag">${Number(x.total_net).toFixed(2)} net</span></div>`).join(''):empty('Deneme verisi yok','Deneme sonuçlarını kaydettiğinde trend burada görünür.','▥')}</div></article></div>`;
  $('[data-wrong-analysis]',root)?.addEventListener('click',()=>navigate('wrongAnalysis'));
}

function formatTimer(sec){const m=Math.floor(sec/60),s=sec%60;return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;}
function stopTimer(){clearInterval(state.timer.interval);state.timer.interval=null;state.timer.running=false;}
function updateTimerUI(){const t=$('#timerTime',root),ring=$('#timerRing',root),start=$('#timerStart',root);if(!t)return;t.textContent=formatTimer(state.timer.left);ring.style.setProperty('--timer-progress',`${100*(1-state.timer.left/state.timer.total)}%`);if(start)start.textContent=state.timer.running?'Duraklat':'Başlat';}
async function timerComplete(){stopTimer();updateTimerUI();const subject=$('#focusSubject',root)?.value||'',topic=$('#focusTopic',root)?.value||'';const mins=Math.max(1,Math.round(state.timer.total/60));try{await api('/api/study',{method:'POST',body:JSON.stringify({sessionDate:todayISO(),subject,topic,durationMinutes:mins,source:'pomodoro'})});toast(`${mins} dakikalık odak oturumu kaydedildi.`);}catch(e){toast(e.message,'error');}}

async function renderFocus(){
  await ensureCurriculum();const d=await api('/api/study');stopTimer();state.timer.total=25*60;state.timer.left=25*60;state.timer.preset=25;
  root.innerHTML=`<div class="section-title"><div><span class="eyebrow">ODAK SÜRESİ</span><h1>Pomodoro & Çalışma</h1><p>Tamamlanan odak oturumları çalışma sürene ve günlük serine otomatik eklenir.</p></div></div><div class="pomodoro"><article class="panel timer-card"><div class="preset-row"><button class="btn small" data-preset="25">25 dk</button><button class="btn small" data-preset="50">50 dk</button><button class="btn small" data-preset="90">90 dk</button></div><div id="timerRing" class="timer-ring"><div id="timerTime" class="timer-time">25:00</div></div><div class="field-row"><label>Ders<select id="focusSubject"><option value="">Ders seçmeden</option>${allSubjects().map(s=>`<option>${esc(s)}</option>`).join('')}</select></label><label>Konu<input id="focusTopic" placeholder="İsteğe bağlı"></label></div><div class="timer-actions"><button id="timerStart" class="btn primary">Başlat</button><button id="timerReset" class="btn">Sıfırla</button></div></article>
  <article class="panel"><div class="panel-head"><div><span class="eyebrow">MANUEL KAYIT</span><h3>Çalışma süresi ekle</h3></div></div><form id="studyForm" class="compact-form"><div class="field-row"><label>Tarih<input name="sessionDate" type="date" value="${todayISO()}"></label><label>Süre (dk)<input name="durationMinutes" type="number" min="1" max="1440" required></label></div><label>Ders<select name="subject"><option value="">Ders seçmeden</option>${allSubjects().map(s=>`<option>${esc(s)}</option>`).join('')}</select></label><label>Konu<input name="topic"></label><button class="btn primary" type="submit">Çalışmayı Kaydet</button></form><div class="list" style="margin-top:16px">${(d.items||[]).length?d.items.slice(0,8).map(x=>`<div class="list-row"><div class="grow"><strong>${x.duration_minutes} dk · ${esc(x.subject||'Genel çalışma')}</strong><small>${fmtDate(x.session_date)}${x.topic?' · '+esc(x.topic):''} · ${x.source==='pomodoro'?'Pomodoro':'Manuel'}</small></div><button class="btn danger small" data-study-delete="${x.id}">Sil</button></div>`).join(''):empty('Çalışma kaydı yok','İlk odak oturumunu başlat.','◷')}</div></article></div>`;
  $$('[data-preset]',root).forEach(b=>b.onclick=()=>{stopTimer();state.timer.preset=Number(b.dataset.preset);state.timer.total=state.timer.preset*60;state.timer.left=state.timer.total;updateTimerUI();});
  $('#timerStart',root).onclick=()=>{if(state.timer.running){stopTimer();updateTimerUI();return;}state.timer.running=true;updateTimerUI();state.timer.interval=setInterval(()=>{state.timer.left--;updateTimerUI();if(state.timer.left<=0)timerComplete();},1000);};
  $('#timerReset',root).onclick=()=>{stopTimer();state.timer.left=state.timer.total;updateTimerUI();};
  $('#studyForm',root).onsubmit=async e=>{e.preventDefault();const b=e.currentTarget.querySelector('button[type=submit]');loading(b,true);try{await api('/api/study',{method:'POST',body:JSON.stringify({...formDataObject(e.currentTarget),source:'manual'})});toast('Çalışma kaydedildi.');renderFocus();}catch(err){toast(err.message,'error');}finally{loading(b,false,'Çalışmayı Kaydet');}};
  $$('[data-study-delete]',root).forEach(b=>b.onclick=async()=>{if(!confirm('Çalışma kaydını silmek istiyor musun?'))return;await api(`/api/study?id=${b.dataset.studyDelete}`,{method:'DELETE'});renderFocus();});updateTimerUI();
}

async function renderSleep(){
  const d=await api('/api/sleep');root.innerHTML=`<div class="section-title"><div><span class="eyebrow">DÜZEN</span><h1>Uyku Takibi</h1><p>Uyku verini kendin kaydet; süre otomatik hesaplanır.</p></div></div><div class="form-panel"><article class="panel"><form id="sleepForm" class="compact-form"><label>Tarih<input name="sleepDate" type="date" value="${todayISO()}" required></label><div class="field-row"><label>Yatış<input name="bedtime" type="time" required></label><label>Kalkış<input name="wakeTime" type="time" required></label></div><label>Uyku kalitesi<select name="quality"><option value="">Belirtme</option><option value="1">1 · Çok kötü</option><option value="2">2</option><option value="3">3 · Orta</option><option value="4">4</option><option value="5">5 · Çok iyi</option></select></label><button class="btn primary" type="submit">Uyku Kaydını Ekle</button></form></article><article class="panel"><div class="list">${(d.items||[]).length?d.items.map(x=>`<div class="list-row"><div class="grow"><strong>${Math.floor(x.duration_minutes/60)} sa ${x.duration_minutes%60} dk</strong><small>${fmtDate(x.sleep_date)} · ${String(x.bedtime).slice(0,5)} → ${String(x.wake_time).slice(0,5)}${x.quality?' · kalite '+x.quality+'/5':''}</small></div><button class="btn danger small" data-sleep-delete="${x.id}">Sil</button></div>`).join(''):empty('Uyku kaydı yok','İlk gece kaydını ekle.','☾')}</div></article></div>`;
  $('#sleepForm',root).onsubmit=async e=>{e.preventDefault();const b=e.currentTarget.querySelector('button[type=submit]');loading(b,true);try{const f=formDataObject(e.currentTarget);await api('/api/sleep',{method:'POST',body:JSON.stringify({...f,quality:f.quality?Number(f.quality):null})});toast('Uyku kaydedildi.');renderSleep();}catch(err){toast(err.message,'error');}finally{loading(b,false,'Uyku Kaydını Ekle');}};
  $$('[data-sleep-delete]',root).forEach(b=>b.onclick=async()=>{if(!confirm('Uyku kaydını silmek istiyor musun?'))return;await api(`/api/sleep?id=${b.dataset.sleepDelete}`,{method:'DELETE'});renderSleep();});
}

async function renderBadges(){
  const d=await api('/api/badges');root.innerHTML=`<div class="section-title"><div><span class="eyebrow">OYUNLAŞTIRMA</span><h1>Rozetler</h1><p>Rozetler gerçek çalışma, soru, kaynak ve müfredat verilerinden otomatik açılır.</p></div><span class="tag green">${(d.items||[]).filter(x=>x.earned).length}/${(d.items||[]).length} kazanıldı</span></div><div class="card-grid">${(d.items||[]).map(x=>`<article class="badge-card ${x.earned?'':'locked'}"><div class="badge-icon">${x.icon}</div><h4>${esc(x.label)}</h4><p>${esc(x.description)}</p><div class="badge-date">${x.earned?`Kazanıldı · ${fmtDate(x.earnedAt)}`:'Henüz kilitli'}</div></article>`).join('')}</div>`;
}

function aiText(v){return `<div class="ai-result">${esc(v||'')}</div>`;}
async function renderAI(){
  if(!state.access?.isPro){root.innerHTML=`<div class="lock-screen"><div class="lock-icon">✦</div><h2>AI Pro özelliği</h2><p>AI Koç, Flashcard, Test Lab, AI programı, fotoğraftan soru çözme ve yanlış analizi AI Pro paketine dahildir.</p><button class="btn primary" data-upgrade>AI Pro'yu Gör</button></div>`;$('[data-upgrade]',root).onclick=()=>navigate('settings');return;}
  await ensureCurriculum();
  const pageToTab={aiCoach:'coach',flashcards:'flashcards',testLab:'test',aiProgram:'program',solver:'solver',wrongAnalysis:'analysis'};
  const meta={
    coach:['AI KOÇ','Kişisel YKS Koçun','Hedef profilin ve kayıtlı çalışma verilerin üzerinden soru sor, durumunu değerlendir ve yönlendirme al.'],
    flashcards:['FLASHCARD','AI Flashcard','Ders ve konu seç; seçtiğin 2026 YKS kapsamından çalışma kartları üret.'],
    test:['TEST LAB','AI Test Lab','Ders ve konu seç; YKS odaklı mini test oluştur ve sonucunu anında gör.'],
    program:['AI PROGRAM','7 Günlük AI Programı','Hedeflerin, performansın, denemelerin ve tekrar listen üzerinden 7 günlük program oluştur.'],
    solver:['SORU ÇÖZÜCÜ','Fotoğraftan Soru Çözümü','Soru fotoğrafını gönder; AI çözümü adım adım açıklasın.'],
    analysis:['YANLIŞ ANALİZİ','AI Yanlış Analizi','Kayıtlı soru verileri ve yanlış arşivinden hangi alanlara öncelik vermen gerektiğini analiz et.']
  };
  state.aiTab=pageToTab[state.page]||'coach';const m=meta[state.aiTab];
  root.innerHTML=`<div class="section-title"><div><span class="eyebrow">${m[0]}</span><h1>${m[1]}</h1><p>${m[2]}</p></div><span class="tag">AI PRO</span></div><article id="aiPanel" class="panel ai-panel"></article>`;
  drawAiTab();
}

function aiSelects(prefix){return `<div class="field-row"><label>Sınav<select id="${prefix}Exam"><option>TYT</option><option>AYT</option></select></label><label>Ders<select id="${prefix}Subject"></select></label></div><label>Konu<select id="${prefix}Topic"></select></label>`;}
function bindAiSelects(prefix){bindExamSubjectTopic($(`#${prefix}Exam`,root),$(`#${prefix}Subject`,root),$(`#${prefix}Topic`,root));}

function drawAiTab(){
  const p=$('#aiPanel',root);if(!p)return;
  if(state.aiTab==='coach'){
    p.innerHTML=`<div class="panel-head"><div><span class="eyebrow">KİŞİSEL KOÇ</span><h3>AI Koç</h3></div></div><div id="chatLog" class="chat-log"><div class="bubble ai">Hedefini, soru performansını, son denemelerini ve tekrar listeni dikkate alarak YKS çalışman hakkında yardımcı olabilirim.</div></div><form id="coachForm" class="chat-form"><textarea name="message" placeholder="Örn. Son verilerime göre bu hafta neye öncelik vermeliyim?" required></textarea><button class="btn primary" type="submit">Gönder</button></form>`;
    $('#coachForm',root).onsubmit=async e=>{e.preventDefault();const msg=e.currentTarget.message.value.trim();if(!msg)return;const log=$('#chatLog',root);log.insertAdjacentHTML('beforeend',`<div class="bubble user">${esc(msg)}</div>`);e.currentTarget.message.value='';const b=e.currentTarget.querySelector('button');loading(b,true);try{const d=await api('/api/ai',{method:'POST',body:JSON.stringify({action:'coach',message:msg})});log.insertAdjacentHTML('beforeend',`<div class="bubble ai">${esc(d.answer)}</div>`);log.scrollTop=log.scrollHeight;}catch(err){toast(err.message,'error');}finally{loading(b,false,'Gönder');}};return;
  }
  if(state.aiTab==='flashcards'){
    p.innerHTML=`<div class="panel-head"><div><span class="eyebrow">AKTİF HATIRLAMA</span><h3>Flashcard üret</h3></div></div><form id="flashForm" class="compact-form">${aiSelects('f')}<label>Kart sayısı<select name="count"><option>5</option><option selected>10</option><option>15</option><option>20</option></select></label><button class="btn primary" type="submit">✦ Flashcard Oluştur</button></form><div id="flashResult"></div>`;bindAiSelects('f');
    $('#flashForm',root).onsubmit=async e=>{e.preventDefault();const b=e.currentTarget.querySelector('button');loading(b,true);try{const d=await api('/api/ai',{method:'POST',body:JSON.stringify({action:'flashcards',exam:$('#fExam',root).value,subject:$('#fSubject',root).value,topicId:$('#fTopic',root).value,count:Number(e.currentTarget.count.value)})});$('#flashResult',root).innerHTML=`<p class="muted">Kartın üzerine tıklayarak cevabı çevir.</p><div class="flash-grid">${d.cards.map((c,i)=>`<div class="flash-card" data-flash="${i}"><div class="flash-inner"><div class="flash-face">${esc(c.front)}</div><div class="flash-face flash-back">${esc(c.back)}</div></div></div>`).join('')}</div>`;$$('[data-flash]',root).forEach(c=>c.onclick=()=>c.classList.toggle('flipped'));}catch(err){toast(err.message,'error');}finally{loading(b,false,'✦ Flashcard Oluştur');}};return;
  }
  if(state.aiTab==='test'){
    p.innerHTML=`<div class="panel-head"><div><span class="eyebrow">MİNİ TEST</span><h3>Test Lab</h3></div></div><form id="testForm" class="compact-form">${aiSelects('t')}<label>Soru sayısı<select name="count"><option>5</option><option selected>10</option><option>15</option><option>20</option></select></label><button class="btn primary" type="submit">✦ Test Oluştur</button></form><div id="testResult"></div>`;bindAiSelects('t');
    $('#testForm',root).onsubmit=async e=>{e.preventDefault();const b=e.currentTarget.querySelector('button');loading(b,true);try{const d=await api('/api/ai',{method:'POST',body:JSON.stringify({action:'test',exam:$('#tExam',root).value,subject:$('#tSubject',root).value,topicId:$('#tTopic',root).value,count:Number(e.currentTarget.count.value)})});state.currentTest=d.questions;$('#testResult',root).innerHTML=`<form id="generatedTest">${d.questions.map((q,i)=>`<div class="test-question"><p><b>${i+1}.</b> ${esc(q.question)}</p>${q.options.map((o,j)=>`<label class="option"><input type="radio" name="q${i}" value="${j}"><span>${esc(o)}</span></label>`).join('')}</div>`).join('')}<button class="btn primary" type="submit">Testi Bitir</button></form><div id="testScore"></div>`;$('#generatedTest',root).onsubmit=ev=>{ev.preventDefault();let correct=0;const explanations=[];d.questions.forEach((q,i)=>{const picked=$(`input[name="q${i}"]:checked`,ev.currentTarget);if(Number(picked?.value)===Number(q.correctIndex))correct++;else explanations.push(`${i+1}. soru: ${q.explanation}`);});$('#testScore',root).innerHTML=`<div class="notice ${correct/d.questions.length>=.7?'success':'warning'}"><span class="notice-dot"></span><p><strong>${correct}/${d.questions.length} doğru</strong>Başarı oranı %${Math.round(correct/d.questions.length*100)}</p></div>${explanations.length?aiText(explanations.join('\n\n')):''}`;};}catch(err){toast(err.message,'error');}finally{loading(b,false,'✦ Test Oluştur');}};return;
  }
  if(state.aiTab==='program'){
    p.innerHTML=`<div class="panel-head"><div><span class="eyebrow">7 GÜNLÜK PLAN</span><h3>AI çalışma programı</h3></div></div><form id="programForm" class="compact-form"><label>Günlük yaklaşık çalışma süresi<select name="hoursPerDay"><option>2</option><option>3</option><option selected>4</option><option>5</option><option>6</option><option>7</option><option>8</option></select></label><label>Ek not<textarea name="note" placeholder="Örn. Çarşamba okuldan geç çıkıyorum; matematik önceliğim olsun."></textarea></label><button class="btn primary" type="submit">✦ Program Oluştur</button></form><div id="programResult"></div>`;
    $('#programForm',root).onsubmit=async e=>{e.preventDefault();const b=e.currentTarget.querySelector('button');loading(b,true);try{const f=formDataObject(e.currentTarget),d=await api('/api/ai',{method:'POST',body:JSON.stringify({action:'program',hoursPerDay:Number(f.hoursPerDay),note:f.note})});state.aiProgram=d;$('#programResult',root).innerHTML=`${aiText(d.summary)}<div>${d.days.map(day=>`<div class="program-day"><h4>${fmtDate(day.date)}</h4>${day.tasks.map(t=>`<div class="program-task"><div><b>${esc(t.exam)} · ${esc(t.subject)}</b> · ${esc(t.topic)}<br><small>${esc(t.reason)}</small></div><span class="tag">${t.minutes} dk</span></div>`).join('')}</div>`).join('')}</div><button id="saveAiProgram" class="btn success wide">Bu 7 Günü Programa Ekle</button>`;$('#saveAiProgram',root).onclick=saveAiProgram;}catch(err){toast(err.message,'error');}finally{loading(b,false,'✦ Program Oluştur');}};return;
  }
  if(state.aiTab==='solver'){
    p.innerHTML=`<div class="panel-head"><div><span class="eyebrow">GÖRSELDEN ÇÖZÜM</span><h3>AI Soru Çözücü</h3></div></div><form id="solverForm" class="compact-form"><label>Soru fotoğrafı<input id="solverImage" type="file" accept="image/*" ${state.solveImage?'':'required'}></label>${state.solveImage?`<img id="solverPreview" class="archive-img" style="max-width:420px" src="${state.solveImage}" alt="Seçili soru">`:''}<label>İsteğe bağlı not<textarea name="prompt" placeholder="Örn. Bu soruda neden B seçeneği yanlış?"></textarea></label><button class="btn primary" type="submit">✦ Soruyu Çöz</button></form><div id="solverResult"></div>`;
    $('#solverImage',root).onchange=async e=>{if(!e.target.files[0])return;try{state.solveImage=await compressImage(e.target.files[0],1600,.82);let im=$('#solverPreview',root);if(!im){im=document.createElement('img');im.id='solverPreview';im.className='archive-img';im.style.maxWidth='420px';e.target.closest('label').after(im);}im.src=state.solveImage;}catch(err){toast(err.message,'error');}};
    $('#solverForm',root).onsubmit=async e=>{e.preventDefault();const b=e.currentTarget.querySelector('button');loading(b,true);try{let imageData=state.solveImage;if(!imageData&&$('#solverImage',root).files[0])imageData=await compressImage($('#solverImage',root).files[0],1600,.82);if(!imageData)throw new Error('Soru fotoğrafı seç.');const d=await api('/api/ai',{method:'POST',body:JSON.stringify({action:'solve_image',imageData,mimeType:'image/jpeg',prompt:e.currentTarget.prompt.value})});$('#solverResult',root).innerHTML=aiText(d.answer);}catch(err){toast(err.message,'error');}finally{loading(b,false,'✦ Soruyu Çöz');}};return;
  }
  if(state.aiTab==='analysis'){
    p.innerHTML=`<div class="panel-head"><div><span class="eyebrow">SADECE AI PRO</span><h3>Yanlış Analizi</h3></div></div><p class="muted">Soru kayıtların ve dijital yanlış arşivindeki notlar üzerinden önceliklerini çıkarır. Temel pakette bu analiz yoktur.</p><button id="runAnalysis" class="btn primary">✦ Analizi Başlat</button><div id="analysisResult" style="margin-top:14px"></div>`;
    $('#runAnalysis',root).onclick=async()=>{const b=$('#runAnalysis',root);loading(b,true);try{const d=await api('/api/ai',{method:'POST',body:JSON.stringify({action:'wrong_analysis'})});$('#analysisResult',root).innerHTML=aiText(d.answer);}catch(err){toast(err.message,'error');}finally{loading(b,false,'✦ Analizi Başlat');}};
  }
}

async function saveAiProgram(){
  const b=$('#saveAiProgram',root);loading(b,true);try{await api('/api/planner',{method:'POST',body:JSON.stringify({action:'bulkAi',days:state.aiProgram.days})});toast('AI programının tamamı çalışma programına eklendi.');navigate('planner');}catch(err){toast(err.message,'error');}finally{loading(b,false,'Bu 7 Günü Programa Ekle');}
}

async function renderDuels(){
  if(!state.access?.isPro){root.innerHTML=`<div class="lock-screen"><div class="lock-icon">⚔</div><h2>Düello · AI Pro</h2><p>Arkadaşına özel davet linki gönderip 7 günlük çalışma süresi veya soru sayısı yarışması başlatabilirsin.</p><button class="btn primary" data-upgrade>AI Pro'yu Gör</button></div>`;$('[data-upgrade]',root).onclick=()=>navigate('settings');return;}
  const [d,leader]=await Promise.all([api('/api/duels'),api('/api/leaderboard')]);const pending=state.pendingDuel||'';
  const leaderboard=leader.items||[];
  root.innerHTML=`<div class="section-title"><div><span class="eyebrow">7 GÜNLÜK YARIŞ</span><h1>Düello</h1><p>Davet linkini yalnızca yarışmak istediğin arkadaşınla paylaş. Düello ve arkadaş liderliği AI Pro kullanıcıları arasında çalışır.</p></div></div><div class="form-panel"><article class="panel"><div class="panel-head"><div><span class="eyebrow">YENİ DÜELLO</span><h3>Yarış başlat</h3></div></div><form id="duelCreate" class="compact-form"><label>Başlık<input name="title" value="Haftalık Çalışma Düellosu"></label><label>Ölçüt<select name="metric"><option value="study_minutes">Çalışma dakikası</option><option value="questions">Çözülen soru</option></select></label><button class="btn primary" type="submit">Düello Oluştur</button></form><hr style="border:0;border-top:1px solid var(--line);margin:20px 0"><form id="duelJoin" class="compact-form"><label>Davet kodu<input name="code" value="${esc(pending)}" placeholder="Örn. A1B2C3"></label><button class="btn soft" type="submit">Düelloya Katıl</button></form></article><article><div class="panel leaderboard-panel"><div class="panel-head"><div><span class="eyebrow">BU HAFTA</span><h3>Arkadaş Liderliği</h3></div><span class="tag">Özel çevre</span></div><p class="muted">Yalnızca daha önce düello yaptığın kişiler görünür; herkese açık global liste yoktur.</p><div class="leaderboard-list">${leaderboard.length?leaderboard.map((x,i)=>`<div class="leaderboard-row ${x.isMe?'me':''}"><span class="leader-rank">${i+1}</span><div class="grow"><strong>${esc(x.name)}${x.isMe?' · Sen':''}</strong><small>${x.studyMinutes} dk çalışma · ${x.questions} soru</small></div></div>`).join(''):empty('Henüz arkadaş yok','Bir arkadaşın düelloya katıldığında haftalık liderlik burada oluşur.','◇')}</div></div><div class="card-grid" style="margin-top:12px">${(d.items||[]).length?d.items.map(x=>{const mine=Number(x.owner_user_id)===Number(state.user.id)?x.ownerScore:x.challengerScore,their=Number(x.owner_user_id)===Number(state.user.id)?x.challengerScore:x.ownerScore,opponent=Number(x.owner_user_id)===Number(state.user.id)?x.challenger_name:x.owner_name,unit=x.metric==='study_minutes'?'dk':'soru';return `<article class="duel-card"><div class="panel-head"><div><h4>${esc(x.title)}</h4><span class="archive-meta">${fmtDate(x.starts_on)} – ${fmtDate(x.ends_on)}</span></div><span class="tag">${x.metric==='study_minutes'?'Süre':'Soru'}</span></div><div class="progress-pair"><div class="progress-box"><h4>Sen</h4><strong>${mine} ${unit}</strong></div><div class="progress-box"><h4>${esc(opponent||'Rakip bekleniyor')}</h4><strong>${their} ${unit}</strong></div></div><div class="card-actions"><button class="btn small" data-copy-duel="${esc(x.invite_code)}">Davet linkini kopyala</button></div></article>`}).join(''):empty('Henüz düello yok','İlk haftalık yarışını oluştur.','⚔')}</div></article></div>`;
  $('#duelCreate',root).onsubmit=async e=>{e.preventDefault();const b=e.currentTarget.querySelector('button');loading(b,true);try{const x=await api('/api/duels',{method:'POST',body:JSON.stringify({action:'create',...formDataObject(e.currentTarget)})});const link=`${location.origin}/?duel=${encodeURIComponent(x.item.invite_code)}`;try{await navigator.clipboard.writeText(link);}catch{}toast('Düello oluşturuldu. Davet linki hazır.');renderDuels();}catch(err){toast(err.message,'error');}finally{loading(b,false,'Düello Oluştur');}};
  $('#duelJoin',root).onsubmit=async e=>{e.preventDefault();const b=e.currentTarget.querySelector('button');loading(b,true);try{await api('/api/duels',{method:'POST',body:JSON.stringify({action:'join',code:e.currentTarget.code.value})});state.pendingDuel='';history.replaceState({},'',location.pathname);toast('Düelloya katıldın.');renderDuels();}catch(err){toast(err.message,'error');}finally{loading(b,false,'Düelloya Katıl');}};
  $$('[data-copy-duel]',root).forEach(b=>b.onclick=async()=>{const link=`${location.origin}/?duel=${encodeURIComponent(b.dataset.copyDuel)}`;try{await navigator.clipboard.writeText(link);toast('Davet linki kopyalandı.');}catch{prompt('Bu linki kopyala:',link);}});
}

async function refreshUser(){const d=await api('/api/auth/me');state.user=d.user;state.access=d.access;updateShell();return d;}
async function renderSettings(){
  const l=await api('/api/license');const u=state.user,a=state.access;
  root.innerHTML=`<div class="section-title"><div><span class="eyebrow">HESAP & ERİŞİM</span><h1>Ayarlar</h1><p>Hedef bilgilerini güncelle, paket kodunu etkinleştir ve hesabını yönet.</p></div><span class="tag ${a.isPro?'green':''}">${esc(planLabel(a.plan))}</span></div>
  ${!a.hasPaidAccess?`<div class="lock-screen" style="margin-bottom:15px"><div class="lock-icon">◇</div><h2>Hesabın hazır; şimdi paketini etkinleştir</h2><p>Shopier satın alımından gelen kişiye özel kodu aşağıdaki alana gir. Kod kullanıldıktan sonra yalnızca bu hesaba bağlanır.</p></div>`:''}
  <div class="pricing-grid"><article class="price-card"><span class="eyebrow">TEMEL</span><h3>Temel</h3><div class="price">99 TL <small>/ ay</small></div><p>Müfredat, hedef profili, manuel program, deneme, soru, kaynak, yanlış soru arşivi, tekrar listesi, performans, Pomodoro, uyku, streak, rozet ve akıllı uyarılar.</p></article><article class="price-card pro"><span class="eyebrow">AI PRO</span><h3>AI Pro</h3><div class="price">299 TL <small>/ ay</small></div><p>Temel'in tamamı + AI Koç, Flashcard, Test Lab, AI program, fotoğraftan soru çözme, yanlış analizi ve düello.</p></article><article class="price-card pro"><span class="eyebrow">AI PRO YILLIK</span><h3>AI Pro</h3><div class="price">1299 TL <small>/ yıl</small></div><p>AI Pro özelliklerinin 365 günlük erişimi.</p></article></div>
  <div class="content-grid"><article class="panel"><div class="panel-head"><div><span class="eyebrow">LİSANS KODU</span><h3>Paket etkinleştir</h3></div></div><form id="licenseForm" class="license-box"><input name="code" placeholder="YKS-XXXXXX-XXXXXX" required><button class="btn primary" type="submit">Kodu Kullan</button></form><p class="muted" style="font-size:.72rem">Aktif paket: <b>${esc(planLabel(a.plan))}</b>${u.planExpiresAt?` · Bitiş: ${fmtDate(u.planExpiresAt)}`:''}</p></article>
  <article class="panel"><div class="panel-head"><div><span class="eyebrow">HEDEF PROFİLİ</span><h3>Profil bilgileri</h3></div></div><form id="profileForm" class="compact-form"><div class="field-row"><label>Ad soyad<input name="name" value="${esc(u.name)}" required></label><label>Alan<select name="track"><option value="sayisal" ${u.track==='sayisal'?'selected':''}>Sayısal</option><option value="esit_agirlik" ${u.track==='esit_agirlik'?'selected':''}>Eşit Ağırlık</option><option value="sozel" ${u.track==='sozel'?'selected':''}>Sözel</option></select></label></div><div class="field-row"><label>Hedef şehir<input name="targetCity" value="${esc(u.targetCity)}" required></label><label>Hedef üniversite<input name="targetUniversity" value="${esc(u.targetUniversity||'')}"></label></div><div class="field-row"><label>Hedef bölüm<input name="targetDepartment" value="${esc(u.targetDepartment)}" required></label><label>Hedef sıralama<input name="targetRank" type="number" min="1" max="5000000" value="${Number(u.targetRank)}" required></label></div><button class="btn soft" type="submit">Profili Güncelle</button></form></article></div>
  <div class="content-grid" style="margin-top:15px"><article class="panel"><div class="panel-head"><div><span class="eyebrow">GÜVENLİK</span><h3>Şifre değiştir</h3></div></div><form id="passwordForm" class="compact-form"><label>Mevcut şifre<input name="currentPassword" type="password" required></label><label>Yeni şifre<input name="newPassword" type="password" minlength="8" required></label><button class="btn" type="submit">Şifreyi Değiştir</button></form></article><article class="panel"><div class="panel-head"><div><span class="eyebrow">VERİLERİN</span><h3>Hesabın sana ait</h3></div></div><p class="muted" style="line-height:1.65">Kayıtların kullanıcı kimliğinle veritabanında tutulur. Oturum çerezi HttpOnly'dir ve 30 gün boyunca geçerlidir. İstersen çalışma verilerinin JSON kopyasını indirebilirsin.</p><button id="exportDataButton" class="btn soft" type="button">Verilerimi İndir</button></article></div>
  ${u.role!=='admin'?`<article class="panel danger-zone" style="margin-top:15px"><div class="panel-head"><div><span class="eyebrow">HESAP KONTROLÜ</span><h3>Hesabımı kalıcı olarak sil</h3></div></div><p class="muted">Bu işlem profilini ve hesabına bağlı çalışma verilerini kalıcı olarak siler. Kullanılmış lisans kodu tekrar kullanılabilir hâle gelmez.</p><form id="deleteAccountForm" class="license-box"><input name="password" type="password" placeholder="Mevcut şifren" required><button class="btn danger" type="submit">Hesabımı Sil</button></form></article>`:''}
  ${u.role==='admin'?`<div class="panel" style="margin-top:15px"><div class="panel-head"><div><span class="eyebrow">ADMIN TEST</span><h3>Lisans ve test erişimi</h3></div></div><div class="admin-grid"><form id="adminCodeForm" class="compact-form"><h4>Kod oluştur</h4><label>Paket<select name="packageKey"><option value="basic_monthly">Temel 30 Gün</option><option value="ai_pro_monthly">AI Pro 30 Gün</option><option value="ai_pro_yearly">AI Pro 365 Gün</option></select></label><label>E-postaya bağla <span class="muted-inline">(isteğe bağlı)</span><input name="assignedEmail" type="email"></label><label>Adet<input name="count" type="number" min="1" max="20" value="1"></label><button class="btn primary" type="submit">Kod Oluştur</button><div id="adminCodes"></div></form><div><form id="adminPreviewForm" class="compact-form"><h4>Kendi ekranını test et</h4><label>Görmek istediğin paket<select name="plan"><option value="none">Paket Yok görünümü</option><option value="basic">Temel görünümü</option><option value="ai_pro" selected>AI Pro görünümü</option></select></label><button class="btn soft" type="submit">Test Görünümüne Geç</button></form><hr style="border:0;border-top:1px solid var(--line);margin:18px 0"><div class="compact-form"><h4>Test verisi</h4><p class="muted">Kendi admin hesabına örnek çalışma, soru, deneme, uyku, program ve müfredat verileri ekler. Böylece boş ekranlarla uğraşmadan bütün panelleri test edebilirsin.</p><button id="adminSeedDemo" class="btn soft" type="button">Örnek Test Verisi Ekle</button></div><hr style="border:0;border-top:1px solid var(--line);margin:18px 0"><form id="adminPlanForm" class="compact-form"><h4>Başka kullanıcı planı</h4><label>Kullanıcı e-postası<input name="email" type="email" required></label><label>Plan<select name="plan"><option value="none">Paket Yok</option><option value="basic">Temel</option><option value="ai_pro">AI Pro</option></select></label><label>Gün<input name="days" type="number" min="1" max="3650" value="30"></label><button class="btn soft" type="submit">Planı Değiştir</button></form></div></div></div>`:''}`;
  $('#licenseForm',root).onsubmit=async e=>{e.preventDefault();const b=e.currentTarget.querySelector('button');loading(b,true);try{const d=await api('/api/license',{method:'POST',body:JSON.stringify({code:e.currentTarget.code.value})});await refreshUser();state.curriculum=null;toast(`Paket etkinleşti: ${planLabel(d.plan)}`);navigate('today');}catch(err){toast(err.message,'error');}finally{loading(b,false,'Kodu Kullan');}};
  $('#profileForm',root).onsubmit=async e=>{e.preventDefault();const b=e.currentTarget.querySelector('button');loading(b,true);try{await api('/api/user/profile-update',{method:'POST',body:JSON.stringify({action:'profile',...formDataObject(e.currentTarget)})});await refreshUser();state.curriculum=null;toast('Profil güncellendi.');renderSettings();}catch(err){toast(err.message,'error');}finally{loading(b,false,'Profili Güncelle');}};
  $('#passwordForm',root).onsubmit=async e=>{e.preventDefault();const b=e.currentTarget.querySelector('button');loading(b,true);try{await api('/api/user/profile-update',{method:'POST',body:JSON.stringify({action:'password',...formDataObject(e.currentTarget)})});e.currentTarget.reset();toast('Şifren değiştirildi.');}catch(err){toast(err.message,'error');}finally{loading(b,false,'Şifreyi Değiştir');}};
  $('#exportDataButton',root).onclick=()=>{window.location.href='/api/user/export-data';};
  if(u.role!=='admin'){
    $('#deleteAccountForm',root).onsubmit=async e=>{e.preventDefault();if(!confirm('Hesabın ve çalışma verilerin kalıcı olarak silinecek. Devam etmek istiyor musun?'))return;const b=e.currentTarget.querySelector('button');loading(b,true);try{await api('/api/user/delete-account',{method:'POST',body:JSON.stringify({password:e.currentTarget.password.value})});state.user=null;state.access=null;state.curriculum=null;state.progress=[];showAuth();toast('Hesabın silindi.');}catch(err){toast(err.message,'error');loading(b,false,'Hesabımı Sil');}};
  }
  if(u.role==='admin'){
    $('#adminCodeForm',root).onsubmit=async e=>{e.preventDefault();const b=e.currentTarget.querySelector('button');loading(b,true);try{const f=formDataObject(e.currentTarget),d=await api('/api/admin',{method:'POST',body:JSON.stringify({action:'generateCode',...f,count:Number(f.count)})});$('#adminCodes',root).innerHTML=d.codes.map(c=>`<div class="code-chip">${esc(c)}</div>`).join('');toast('Lisans kodu oluşturuldu.');}catch(err){toast(err.message,'error');}finally{loading(b,false,'Kod Oluştur');}};
    $('#adminPreviewForm',root).onsubmit=async e=>{e.preventDefault();const b=e.currentTarget.querySelector('button');loading(b,true);try{await api('/api/admin',{method:'POST',body:JSON.stringify({action:'previewPlan',plan:e.currentTarget.plan.value})});await refreshUser();state.curriculum=null;toast('Admin test görünümü değiştirildi.');navigate(state.access.hasPaidAccess?'today':'settings');}catch(err){toast(err.message,'error');}finally{loading(b,false,'Test Görünümüne Geç');}};
    $('#adminSeedDemo',root).onclick=async()=>{const b=$('#adminSeedDemo',root);loading(b,true);try{const d=await api('/api/admin',{method:'POST',body:JSON.stringify({action:'seedDemo'})});toast(d.alreadySeeded?'Örnek test verisi zaten eklenmiş.':'Örnek test verileri eklendi.');state.curriculum=null;await navigate('today');}catch(err){toast(err.message,'error');}finally{loading(b,false,'Örnek Test Verisi Ekle');}};
    $('#adminPlanForm',root).onsubmit=async e=>{e.preventDefault();const b=e.currentTarget.querySelector('button');loading(b,true);try{const f=formDataObject(e.currentTarget);await api('/api/admin',{method:'POST',body:JSON.stringify({action:'setPlan',...f,days:Number(f.days)})});if(f.email.toLowerCase()===state.user.email.toLowerCase())await refreshUser();toast('Plan güncellendi.');renderSettings();}catch(err){toast(err.message,'error');}finally{loading(b,false,'Planı Değiştir');}};
  }
}

(async function boot(){
  state.pendingDuel=new URLSearchParams(location.search).get('duel')||'';
  try{const d=await api('/api/auth/me');state.user=d.user;state.access=d.access;showApp();if(state.pendingDuel&&state.access.isPro)await navigate('duels');else await navigate(state.access.hasPaidAccess?'today':'settings');}
  catch{showAuth();}
})();

