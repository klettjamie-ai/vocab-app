'use strict';
const KEY='tuvung-state-v1',MIN=60e3,DAY=864e5;
const PRAC_IV=[10*MIN,1*DAY,2*DAY,4*DAY]; // practiced: short intervals
const LEARNED_IV0=14*DAY,LEARNED_MAX=120*DAY; // learned: long, doubling
let S=null,sess=null,tab='learn',shown=60;
const $=id=>document.getElementById(id);
const today=()=>new Date().toLocaleDateString('en-CA');
let saveT=null;function saveNow(){clearTimeout(saveT);saveT=null;try{localStorage.setItem(KEY,JSON.stringify(S))}catch(e){console.warn('save failed',e);try{toast('⚠️ Could not save — export a backup')}catch(_){}}}
function save(){if(!saveT)saveT=setTimeout(saveNow,300)} // debounced
addEventListener('pagehide',()=>saveT&&saveNow());document.addEventListener('visibilitychange',()=>{if(document.hidden&&saveT)saveNow()});
const SAFE=/[?&]safe=1/.test(location.search)||localStorage.getItem('tuvung-safe')==='1';if(SAFE)document.documentElement.classList.add('safe');
function blank(){return {v:1,goal:20,sessN:20,streak:0,lastDay:null,doneDay:today(),doneCount:0,cards:{}}}
function valid(d){return d&&typeof d==='object'&&d.cards&&typeof d.cards==='object'&&!Array.isArray(d.cards)}
async function load(){const raw=localStorage.getItem(KEY);if(!raw)return;const d=JSON.parse(raw);if(!valid(d))throw new Error('Saved data is not in the expected format');
  d.goal=+d.goal||20;d.sessN=+d.sessN||20;d.streak=+d.streak||0;d.doneCount=+d.doneCount||0;
  for(const k in d.cards){const c=d.cards[k];if(!c||!c.vi){delete d.cards[k];continue}if(!['learn','practiced','learned'].includes(c.s))c.s='learn';c.lv=Math.max(0,Math.min(+c.lv||0,10));c.due=+c.due||0;c.en=c.en||'';}
  S=d}
// Box rule: box 0/unseen -> learn, boxes 1-4 -> practiced, 5+ -> learned
const boxSec=b=>!b?'learn':(b<=4?'practiced':'learned');
function parseCSV(t){const rows=[];let r=[],f='',q=false;for(let i=0;i<t.length;i++){const ch=t[i];
  if(q){if(ch=='"'){if(t[i+1]=='"'){f+='"';i++}else q=false}else f+=ch}
  else if(ch=='"')q=true;else if(ch==','){r.push(f);f=''}else if(ch=='\n'||ch=='\r'){if(ch=='\r'&&t[i+1]=='\n')i++;r.push(f);rows.push(r);r=[];f=''}else f+=ch}
  if(f||r.length){r.push(f);rows.push(r)}return rows.filter(x=>x.some(v=>v.trim()))}
const hid=s=>{let h=0;for(const c of s)h=(h*31+c.codePointAt(0))>>>0;return 'w'+h.toString(36)};
// Accepts: progress backup {v,cards:{}}, seed [{vi,en,ex,s}], deck {cards:[{front,back,srs}]}, or CSV front,back,hint,publishedAt
function importText(text,name){const now=Date.now();let words;
  if(/\.csv$/i.test(name)||!/^\s*[\[{]/.test(text)){const rows=parseCSV(text.replace(/^\uFEFF/,''));let h=rows[0].map(x=>x.trim().toLowerCase()),fi=h.indexOf('front'),bi=h.indexOf('back'),hi=h.indexOf('hint');
    if(fi<0){fi=0;bi=1;hi=2}else rows.shift();const seen=new Set();words=[];
    rows.forEach(r=>{const vi=(r[fi]||'').trim(),en=(r[bi]||'').trim();const k=vi.toLowerCase();if(!vi||!en||seen.has(k))return;seen.add(k);words.push({id:hid(k),vi,en,ex:(r[hi]||'').trim(),s:'learn'})})}
  else{const d=JSON.parse(text);
    if(d&&d.cards&&!Array.isArray(d.cards)){S=d;save();return 'progress'}
    const arr=Array.isArray(d)?d:(d.cards||[]);
    words=arr.map(w=>({id:w.id||hid((w.vi||w.front).toLowerCase()),vi:w.vi||w.front,en:w.en||w.back,ex:w.ex||w.example||w.hint||'',s:w.s||boxSec(w.srs&&w.srs.box)})).filter(w=>w.vi&&w.en)}
  if(!words.length)throw new Error('no words');
  if(!S)S=blank();let added=0;
  words.forEach(w=>{if(S.cards[w.id])return;added++;S.cards[w.id]={id:w.id,vi:w.vi,en:w.en,ex:w.ex,s:w.s,lv:w.s==='practiced'?1:0,due:w.s==='learned'?now+LEARNED_IV0:now,seen:0,ok:0,miss:0}});
  save();return added}
function rollDay(){if(S.doneDay!==today()){S.doneDay=today();S.doneCount=0;save()}}
const cards=()=>Object.values(S.cards);
// Build a session queue. Practiced words get priority (short intervals), learned words only when due (long intervals) plus a spot-check.
function buildQueue(n,now=Date.now()){
  const all=cards(),sh=a=>a.sort(()=>Math.random()-.5);
  const prac=all.filter(c=>c.s==='practiced'&&c.due<=now).sort((a,b)=>a.due-b.due);
  const lrn=all.filter(c=>c.s==='learned'&&c.due<=now).sort((a,b)=>a.due-b.due);
  const neu=sh(all.filter(c=>c.s==='learn')).sort((a,b)=>(b.miss>0)-(a.miss>0));
  const q=[],take=(arr,k)=>{while(k-->0&&arr.length&&q.length<n)q.push(arr.shift())};
  take(prac,Math.ceil(n*.6));take(lrn,Math.ceil(n*.2));
  if(!q.some(c=>c.s==='learned')){const ex=sh(all.filter(c=>c.s==='learned'));take(ex,1)} // retention spot-check
  take(neu,n);take(prac,n);take(lrn,n);
  return sh(q);
}
function grade(c,g,now=Date.now()){
  c.seen++;
  if(g===0){c.miss++;c.s='learn';c.lv=0;c.due=now}
  else if(g===1){if(c.s==='learned'){c.s='practiced';c.lv=1}else{c.s='practiced';c.lv=Math.max(0,Math.min(c.lv,1))}c.due=now+PRAC_IV[c.lv]}
  else{c.ok++;
    if(c.s==='learn'){c.s='practiced';c.lv=1;c.due=now+PRAC_IV[1]}
    else if(c.s==='practiced'){if(c.lv>=3){c.s='learned';c.lv=0;c.due=now+LEARNED_IV0}else{c.lv++;c.due=now+PRAC_IV[c.lv]}}
    else{c.lv++;c.due=now+Math.min(LEARNED_MAX,LEARNED_IV0*2**c.lv)}}
  c.last=now;
}
function move(id,s){const c=S.cards[id];c.s=s;c.lv=s==='practiced'?1:0;c.due=Date.now()+(s==='learned'?LEARNED_IV0:0);save()}
// UI
function show(v){document.querySelectorAll('.view').forEach(e=>e.classList.toggle('on',e.id==='v-'+v));document.querySelectorAll('nav button').forEach(b=>b.classList.toggle('on',b.dataset.v===v));
  if(v==='home')renderHome();if(v==='words')renderWords();if(v==='study'&&!sess)startSession()}
const EMO={learn:'🌱',practiced:'🌼',learned:'🌈'};const NAMES={learn:'Words to learn',practiced:'Words practiced',learned:'Words learned'};
function renderHome(){rollDay();const cnt={learn:0,practiced:0,learned:0},now=Date.now();let due=0;
  cards().forEach(c=>{cnt[c.s]++;if(c.s!=='learn'&&c.due<=now)due++});
  $('tiles').innerHTML=Object.keys(cnt).map(k=>`<button class="tile ${k}" data-s="${k}"><span class="em">${EMO[k]}</span><span class="n">${cnt[k]}</span>${NAMES[k]}</button>`).join('');
  document.querySelectorAll('.tile').forEach(t=>t.onclick=()=>{tab=t.dataset.s;show('words')});
  const p=Math.min(100,S.doneCount/S.goal*100);$('ringc').setAttribute('stroke-dasharray',p+' 100');$('ringt').textContent=Math.round(p)+'%';
  $('goaltxt').textContent=`${S.doneCount} / ${S.goal} hôm nay`;$('duetxt').textContent=`${due} due for review`;$('streak').textContent='🔥 '+S.streak;}
function startSession(){sess={q:buildQueue(S.sessN),i:0,total:0};sess.total=sess.q.length;showCard()}
function showCard(){const c=sess.q[sess.i];$('card').classList.remove('flip');
  if(!c){celebrate('🎉 Xong rồi! Giỏi quá!');sess=null;return show('home')}
  $('fvi').textContent=$('bvi').textContent=c.vi;$('ben').textContent=c.en;$('bex').textContent=c.ex||'';
  $('tag').textContent=NAMES[c.s];$('tag').className='tag '+c.s;$('pbar').style.width=(sess.i/sess.q.length*100)+'%'}
function answer(g){if(!sess)return;const c=sess.q[sess.i];if(!c)return;const cd=$('card');cd.classList.remove('wig','bnc','pop');void cd.offsetWidth;cd.classList.add(['wig','pop','bnc'][g]);grade(c,g);
  if(g===0)sess.q.splice(Math.min(sess.q.length,sess.i+4),0,c); // missed: see again soon in this session
  rollDay();S.doneCount++;
  if(S.doneCount===S.goal){const y=new Date(Date.now()-DAY).toLocaleDateString('en-CA');S.streak=S.lastDay===y?S.streak+1:(S.lastDay===today()?S.streak:1);S.lastDay=today();celebrate('🔥 Daily goal! Streak '+S.streak)}
  else if(g===2&&c.s==='learned'&&c.lv===0)celebrate('🌟 Learned: '+c.vi,false);
  save();sess.i++;showCard()}
function renderWords(){document.querySelectorAll('#wtabs button').forEach(b=>b.classList.toggle('on',b.dataset.s===tab));
  const q=$('q').value.trim().toLowerCase(),f=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d');
  const list=cards().filter(c=>c.s===tab&&(!q||f(c.vi.toLowerCase()).includes(f(q))||c.en.toLowerCase().includes(q)));
  $('wlist').innerHTML=(list.length?`<p class="muted">${list.length} words</p>`:`<div class="empty"><span class="e">${q?'🔍':EMO[tab]}</span><b>${q?'Không thấy từ nào!':'Nothing here yet!'}</b><br>${q?'Try another search ✨':'Practice a bit and words will bloom here 🌸'}</div>`)+list.slice(0,shown).map(c=>`<div class="row"><div><b>${esc(c.vi)}</b><small>${esc(c.en)}</small></div><button class="say" style="position:static" data-say="${esc(c.vi)}">🔊</button><select data-id="${c.id}">${Object.keys(NAMES).map(k=>`<option value="${k}"${k===c.s?' selected':''}>${k==='learn'?'To learn':k[0].toUpperCase()+k.slice(1)}</option>`).join('')}</select></div>`).join('');
  $('more').style.display=list.length>shown?'':'none';
  $('wlist').querySelectorAll('select').forEach(s=>s.onchange=()=>{move(s.dataset.id,s.value);toast('Moved ✓');renderWords()});
  $('wlist').querySelectorAll('[data-say]').forEach(b=>b.onclick=()=>speak(b.dataset.say))}
const esc=s=>String(s).replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));
function speak(t){try{const u=new SpeechSynthesisUtterance(t);u.lang='vi-VN';const v=speechSynthesis.getVoices().find(v=>/^vi/i.test(v.lang));if(v)u.voice=v;u.rate=.85;speechSynthesis.cancel();speechSynthesis.speak(u)}catch(e){toast('No Vietnamese voice')}}
function toast(m){const t=$('toast');t.textContent=m;t.classList.add('on');clearTimeout(t._h);t._h=setTimeout(()=>t.classList.remove('on'),1300)}
function celebrate(m,big=true){toast(m);confetti(big?160:50)}
function confetti(n){if(SAFE)return;const cv=$('cf');if(cv._busy)return;cv.style.display='block';const x=cv.getContext('2d');cv.width=innerWidth;cv.height=innerHeight;const cols=['#ffc6dd','#c9b8ff','#a8e6cf','#a8d8ff','#fff1a8','#ffd6c4'];
  const P=Array.from({length:n},()=>({x:cv.width/2,y:cv.height/3,vx:(Math.random()-.5)*14,vy:-Math.random()*12-3,c:cols[Math.random()*6|0],r:Math.random()*6+3,a:Math.random()*6}));let f=0;
  (function st(){x.clearRect(0,0,cv.width,cv.height);P.forEach(p=>{p.x+=p.vx;p.y+=p.vy;p.vy+=.4;p.a+=.2;x.fillStyle=p.c;x.save();x.translate(p.x,p.y);x.rotate(p.a);x.fillRect(-p.r/2,-p.r/2,p.r,p.r*1.6);x.restore()});if(++f<90)requestAnimationFrame(st);else{x.clearRect(0,0,cv.width,cv.height);cv.width=cv.height=0;cv.style.display='none'}})()}
function init(){if(inited)return renderHome();inited=true;show('home');
  document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>show(b.dataset.v));
  $('startBtn').onclick=()=>{sess=null;show('study')};$('quitBtn').onclick=()=>{sess=null;show('home')};
  $('card').onclick=e=>{if(e.target.classList.contains('say'))return;$('card').classList.toggle('flip')};
  $('say1').onclick=$('say2').onclick=()=>sess&&sess.q[sess.i]&&speak(sess.q[sess.i].vi);
  document.querySelectorAll('.grade button').forEach(b=>b.onclick=()=>answer(+b.dataset.g));
  let sx,sy;const cd=$('card');cd.addEventListener('touchstart',e=>{sx=e.touches[0].clientX;sy=e.touches[0].clientY},{passive:true});
  cd.addEventListener('touchend',e=>{const dx=e.changedTouches[0].clientX-sx,dy=e.changedTouches[0].clientY-sy;if(Math.abs(dx)>70&&Math.abs(dx)>Math.abs(dy))answer(dx>0?2:0);else if(dy<-70)answer(1)});
  document.querySelectorAll('#wtabs button').forEach(b=>b.onclick=()=>{tab=b.dataset.s;shown=60;renderWords()});
  $('q').oninput=()=>{shown=60;renderWords()};$('more').onclick=()=>{shown+=100;renderWords()};
  $('addBtn').onclick=()=>{const vi=$('nvi').value.trim(),en=$('nen').value.trim();if(!vi||!en)return toast('Need word + meaning');const id='u'+Date.now().toString(36);
    S.cards[id]={id,vi,en,ex:$('nex').value.trim(),s:'learn',lv:0,due:Date.now(),seen:0,ok:0,miss:0,user:1};save();$('nvi').value=$('nen').value=$('nex').value='';celebrate('➕ Added: '+vi,false)};
  $('goalSel').value=S.goal;$('sessSel').value=S.sessN;$('goalSel').onchange=e=>{S.goal=+e.target.value;save()};$('sessSel').onchange=e=>{S.sessN=+e.target.value;save()};
  $('expBtn').onclick=()=>{const b=new Blob([JSON.stringify(S)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='tuvung-backup-'+today()+'.json';a.click()};
  $('impBtn').onclick=()=>$('impFile').click();
  $('impFile').onchange=e=>e.target.files[0]&&handleFile(e.target.files[0],false);
  $('ver').textContent='Offline-ready · '+cards().length+' words';
  renderHome();
}
function welcome(){document.body.classList.add('welcome');$('v-welcome').classList.add('on')}
async function handleFile(file,fromWelcome){try{const r=importText(await file.text(),file.name);toast(r==='progress'?'Progress restored ✓':('🌸 Loaded '+r+' words'));confetti(120);
  if(fromWelcome){document.body.classList.remove('welcome');$('v-welcome').classList.remove('on');init()}else show('home')}catch(e){toast('Hmm, that file didn\'t work 🙈')}}
let inited=false;
// Crash-loop guard: if the last start never reached "stable", switch to safe mode next time and offer recovery.
const BOOT='tuvung-boot';let bootN=+(localStorage.getItem(BOOT)||0);
if(bootN>=3&&!SAFE){localStorage.setItem('tuvung-safe','1');location.replace(location.pathname+'?safe=1');}
localStorage.setItem(BOOT,String(bootN+1));setTimeout(()=>localStorage.setItem(BOOT,'0'),1500);
function recovery(err){document.body.classList.add('welcome');document.querySelectorAll('.view').forEach(v=>v.classList.remove('on'));$('v-recover').classList.add('on');
  $('recErr').textContent=String(err&&err.message||err);
  $('recExport').onclick=()=>{const raw=localStorage.getItem(KEY)||'',b=new Blob([raw],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='tuvung-rescue-'+today()+'.json';document.body.appendChild(a);a.click()};
  $('recSafe').onclick=()=>{localStorage.setItem('tuvung-safe','1');location.replace(location.pathname+'?safe=1')};
  $('recReset').onclick=()=>{if(confirm('Erase all progress on this phone? Export first if unsure.')){localStorage.removeItem(KEY);localStorage.setItem(BOOT,'0');location.replace(location.pathname)}}}
function boot(){try{
  $('seedFile').onchange=e=>e.target.files[0]&&handleFile(e.target.files[0],true);$('seedBtn').onclick=()=>$('seedFile').click();
  $('emptyBtn').onclick=()=>{S=blank();saveNow();document.body.classList.remove('welcome');$('v-welcome').classList.remove('on');init();show('more')};
  $('safeToggle').checked=SAFE;$('safeToggle').onchange=e=>{localStorage.setItem('tuvung-safe',e.target.checked?'1':'0');location.replace(location.pathname+(e.target.checked?'?safe=1':''))};
  S?init():welcome()}catch(e){console.error(e);recovery(e)}}
load().then(boot,e=>{console.error(e);recovery(e)});
if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js').then(r=>r.update()).catch(()=>{});
window.__app={saveNow,buildQueue,grade,get S(){return S},PRAC_IV,LEARNED_IV0};
