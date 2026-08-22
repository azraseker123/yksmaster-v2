const run=document.querySelector('#run');
const secret=document.querySelector('#secret');
const result=document.querySelector('#result');

run.addEventListener('click',async()=>{
  run.disabled=true;run.textContent='Kuruluyor…';result.textContent='';
  try{
    if(!secret.value){result.textContent='SETUP_SECRET değerini gir.';return;}
    const response=await fetch('/api/setup',{method:'POST',headers:{'x-setup-secret':secret.value}});
    const data=await response.json().catch(()=>({error:'Sunucudan geçersiz yanıt geldi.'}));
    result.textContent=JSON.stringify(data,null,2);
  }catch(error){result.textContent=error.message||'Kurulum isteği başarısız.';}
  finally{run.disabled=false;run.textContent='Kurulumu Çalıştır';}
});
