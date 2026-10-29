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
const nkey=s=>String(s||'').normalize('NFC').toLowerCase().replace(/\s+/g,' ').trim();
// Accepts: progress backup {v,cards:{}}, word file v2 {format,version,words:[]}, seed [{vi,en,ex,s,sent}], deck {cards:[...]}, or CSV front,back,hint,publishedAt.
// Word lists MERGE into existing progress (matched by id or normalized Vietnamese word): section/SRS kept, sentences & new words added.
function parseWords(text,name){
  if(/\.csv$/i.test(name)||!/^\s*[\[{]/.test(text)){const rows=parseCSV(text.replace(/^\uFEFF/,''));let h=rows[0].map(x=>x.trim().toLowerCase()),fi=h.indexOf('front'),bi=h.indexOf('back'),hi=h.indexOf('hint');
    if(fi<0){fi=0;bi=1;hi=2}else rows.shift();const seen=new Set(),words=[];
    rows.forEach(r=>{const vi=(r[fi]||'').trim(),en=(r[bi]||'').trim();const k=nkey(vi);if(!vi||!en||seen.has(k))return;seen.add(k);words.push({id:hid(k),vi,en,ex:(r[hi]||'').trim(),s:'learn'})});return {words}}
  const d=JSON.parse(text);
  if(d&&d.cards&&!Array.isArray(d.cards))return {progress:d};
  const arr=Array.isArray(d)?d:(d.words||d.cards||[]);
  return {grammar:d.grammar&&d.groups?{groups:d.groups,points:d.grammar}:null,words:arr.map(w=>({id:w.id||hid(nkey(w.vi||w.front)),vi:w.vi||w.front,en:w.en||w.back,ex:w.ex||w.example||w.hint||'',s:w.s||boxSec(w.srs&&w.srs.box),sent:w.sent&&w.sent.vi&&w.sent.blank?w.sent:undefined})).filter(w=>w.vi&&w.en)}}
function mergeWords(words){const now=Date.now();if(!S)S=blank();const byKey={};for(const id in S.cards)byKey[nkey(S.cards[id].vi)]=id;let added=0,updated=0;
  words.forEach(w=>{const id=S.cards[w.id]?w.id:byKey[nkey(w.vi)];
    if(id){const c=S.cards[id];let ch=false;if(w.sent&&JSON.stringify(c.sent)!==JSON.stringify(w.sent)){c.sent=w.sent;ch=true}if(!c.ex&&w.ex){c.ex=w.ex;ch=true}if(ch)updated++;return}
    added++;S.cards[w.id]={id:w.id,vi:w.vi,en:w.en,ex:w.ex,s:w.s,lv:w.s==='practiced'?1:0,due:w.s==='learned'?now+LEARNED_IV0:now,seen:0,ok:0,miss:0};if(w.sent)S.cards[w.id].sent=w.sent;byKey[nkey(w.vi)]=w.id});
  saveNow();return {added,updated}}
function importText(text,name){const r=parseWords(text,name);
  if(r.progress){if(!valid(r.progress))throw new Error('bad backup');S=r.progress;saveNow();return 'progress'}
  if(!r.words.length&&!r.grammar)throw new Error('no words');const res=r.words.length?mergeWords(r.words):{added:0,updated:0};if(r.grammar)res.gram=mergeGrammar(r.grammar);return res}
// Grammar content is replaced from the file; per-point SRS state (S.gram) is kept.
function mergeGrammar(gd){if(!S)S=blank();S.gram=S.gram||{};const pts={};let added=0;gd.points.forEach(p=>{pts[p.id]=p;if(!S.gram[p.id]){S.gram[p.id]={id:p.id,s:'learn',lv:0,due:Date.now(),seen:0,ok:0,miss:0};added++}});
  S.gdata={groups:gd.groups,points:pts};saveNow();return {points:gd.points.length,added}}
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
  if(v==='home')renderHome();if(v==='words')renderWords();if(v==='gram')renderGram();if(v==='study'&&!sess)startSession()}
const EMO={learn:'🌱',practiced:'🌼',learned:'🌈'};const NAMES={learn:'Words to learn',practiced:'Words practiced',learned:'Words learned'};
function renderHome(){rollDay();checkStreak();const cnt={learn:0,practiced:0,learned:0},now=Date.now();let due=0;
  cards().forEach(c=>{cnt[c.s]++;if(c.s!=='learn'&&c.due<=now)due++});
  $('tiles').innerHTML=Object.keys(cnt).map(k=>`<button class="tile ${k}" data-s="${k}"><span class="em">${EMO[k]}</span><span class="n">${cnt[k]}</span>${NAMES[k]}</button>`).join('');
  document.querySelectorAll('.tile').forEach(t=>t.onclick=()=>{tab=t.dataset.s;show('words')});
  const p=Math.min(100,S.doneCount/S.goal*100);$('ringc').setAttribute('stroke-dasharray',p+' 100');$('ringt').textContent=Math.round(p)+'%';
  $('goaltxt').textContent=`${S.doneCount} / ${S.goal} hôm nay`;$('duetxt').textContent=`${due} due for review`;$('streak').textContent='🔥 '+S.streak;try{renderGame()}catch(e){console.warn(e)}}
function settings(){S.types=S.types||{flash:true,pick:true,type:true};S.mix=S.mix||'50,25,25';if(!['vi','en','mix'].includes(S.fdir))S.fdir='mix';if(typeof S.gon!=='boolean')S.gon=true;return S}
const flashDir=()=>{const d=settings().fdir;return d==='mix'?(Math.random()<.5?'vi':'en'):d};
function pickType(c){const t=settings().types,m=S.mix.split(',').map(Number);let opts=[['flash',m[0]],['pick',m[1]],['type',m[2]]].filter(([k])=>t[k]&&(k!=='pick'||(c.sent&&c.sent.blank)));
  if(!opts.length)return 'flash';let r=Math.random()*opts.reduce((s,o)=>s+o[1],0);for(const [k,w] of opts){if((r-=w)<0)return k}return opts[0][0]}
const hasGram=()=>S.gdata&&S.gram&&Object.keys(S.gram).length;
function gramQueue(n,now=Date.now()){if(!hasGram())return [];const order=Object.keys(S.gdata.points),all=order.map(id=>S.gram[id]).filter(Boolean);
  const prac=all.filter(x=>x.s==='practiced'&&x.due<=now).sort((a,b)=>a.due-b.due),lrn=all.filter(x=>x.s==='learned'&&x.due<=now),neu=all.filter(x=>x.s==='learn');
  const q=[],take=(arr,k)=>{while(k-->0&&arr.length&&q.length<n)q.push(arr.shift())};take(prac,Math.ceil(n*.6));take(lrn,Math.ceil(n*.2));take(neu,n);take(prac,n);take(lrn,n);return q}
const gType=()=>['choose','fill','reorder','build'][Math.random()*4|0];
function startSession(mode){settings();if(mode==='gram'&&!S.gon)mode=undefined;const n=S.sessN,gm=mode==='gram'?n:(hasGram()&&S.gon?Math.round(n*(S.gmix==null?20:S.gmix)/100):0);
  const gq=gramQueue(gm).map(x=>({g:x.id,t:gType()})),wq=mode==='gram'?[]:buildQueue(n-gq.length).map(c=>({c,t:pickType(c)}));
  const q=wq.slice();gq.forEach((it,i)=>q.splice(Math.floor((i+1)*q.length/(gq.length+1))+i,0,it));
  sess={q,i:0,mode};sess.total=q.length;showCard()}
const cur=()=>sess&&sess.q[sess.i]&&(sess.q[sess.i].c||(sess.q[sess.i].g&&S.gram[sess.q[sess.i].g]));
function showCard(){const it=sess.q[sess.i],c=it&&it.c;$('card').classList.remove('flip');sess.done=false;
  const t=it?(it.g?'gram':it.t):'flash';$('card').hidden=t!=='flash';$('gradeRow').hidden=t!=='flash';$('pickBox').hidden=t!=='pick';$('typeBox').hidden=t!=='type';$('gramBox').hidden=t!=='gram';$('qNext').hidden=true;
  if(t==='gram'){$('pbar').style.width=(sess.i/sess.q.length*100)+'%';return showGram(it)}
  if(!c){celebrate('🎉 Xong rồi! Giỏi quá!');sess=null;return show('home')}
  if(t==='flash'&&!it.d)it.d=flashDir();const en=t==='flash'&&it.d==='en';$('fvi').textContent=en?c.en:c.vi;$('fvi').className=en?'vi fen':'vi';$('say1').hidden=en;$('dirlab').textContent=en?'EN → VI':'VI → EN';$('bvi').textContent=c.vi;$('ben').textContent=c.en;$('bex').textContent=c.ex||'';
  $('tag').textContent=NAMES[c.s];$('tag').className='tag '+c.s;$('pbar').style.width=(sess.i/sess.q.length*100)+'%';if(t==='pick')showPick(c);if(t==='type')showType(c)}
function answer(g){if(!sess)return;const c=cur();if(!c)return;const cd=$('card');cd.classList.remove('wig','bnc','pop');void cd.offsetWidth;cd.classList.add(['wig','pop','bnc'][g]);record(c,g);sess.i++;showCard()}
function record(c,g,item){grade(c,g);
  if(g===0)sess.q.splice(Math.min(sess.q.length,sess.i+4),0,item&&item.g?{g:item.g,t:gType()}:{c,t:'flash',d:sess.q[sess.i]&&sess.q[sess.i].d});if(item&&item.g){G().gtotal=(G().gtotal||0)+1} // missed: see again soon in this session
  rollDay();S.doneCount++;
  if(S.doneCount>=S.goal&&S.lastDay!==today()){const y=new Date(Date.now()-DAY).toLocaleDateString('en-CA');S.streak=S.lastDay===y?S.streak+1:(S.lastDay===today()?S.streak:1);S.lastDay=today();$('streak').textContent='🔥 '+S.streak;celebrate('🔥 Daily goal! Streak '+S.streak)}
  else if(g===2&&c.s==='learned'&&c.lv===0)celebrate('🌟 Learned: '+(c.vi||(S.gdata&&S.gdata.points[c.id]||{}).pattern),false);
  reward(g);save()}
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

// ---- Rewards & daily habit
const STICKERS=['🌸','🌷','🌼','🍓','🍑','🦋','🐣','🐰','🧁','🍡','🌈','⭐','🍀','🐱','🍵','🎀','🐼','🌙','🍩','🦄','🐝','🍉','🌻','🐬'];
const dayKey=d=>d.toLocaleDateString('en-CA');const addDays=(k,n)=>{const d=new Date(k+'T12:00:00');d.setDate(d.getDate()+n);return dayKey(d)};
const dayDiff=(a,b)=>Math.round((new Date(b+'T12:00:00')-new Date(a+'T12:00:00'))/DAY);
const BADGES=[['s3','🔥 3-day streak',g=>S.streak>=3],['s7','🔥 7 days',g=>S.streak>=7],['s14','🔥 14 days',g=>S.streak>=14],['s30','🏆 30 days',g=>S.streak>=30],['s50','👑 50 days',g=>S.streak>=50],['s100','💎 100 days',g=>S.streak>=100],
 ['w10','🌱 10 learned',g=>nLearned()>=10],['w100','🌳 100 learned',g=>nLearned()>=100],['w500','🌲 500 learned',g=>nLearned()>=500],
 ['a100','✍️ 100 answers',g=>g.total>=100],['a1000','📚 1,000 answers',g=>g.total>=1000],['c10','⚡ 10 combo',g=>g.best>=10],['c25','🌟 25 combo',g=>g.best>=25],['gr25','📐 25 grammar answers',g=>(g.gtotal||0)>=25],['gr250','📐 250 grammar answers',g=>(g.gtotal||0)>=250],['gl10','📐 10 patterns learned',g=>S.gram&&Object.values(S.gram).filter(x=>x.s==='learned').length>=10],['l5','🎓 Level 5',g=>level(g.xp).n>=5],['l10','🎓 Level 10',g=>level(g.xp).n>=10]];
const nLearned=()=>cards().filter(c=>c.s==='learned').length;
function G(){S.g=S.g||{xp:0,days:{},freezes:0,badges:[],combo:0,best:0,total:0,sound:false};return S.g}
function level(xp){let n=1,need=100,acc=0;while(xp>=acc+need){acc+=need;n++;need=100+n*50}return {n,into:xp-acc,need}}
// On open: missed days use streak freezes if available, otherwise the streak resets (progress is never deleted).
function checkStreak(){const g=G(),t=today();if(!S.lastDay||S.lastDay>=addDays(t,-1))return 0;const missed=dayDiff(S.lastDay,t)-1;
  if(missed<=g.freezes){for(let i=1;i<=missed;i++)g.days[addDays(S.lastDay,i)]={frozen:1};g.freezes-=missed;S.lastDay=addDays(t,-1);save();toast('🧊 Streak freeze used ×'+missed);return 0}
  if(S.streak>0){g.lostStreak=S.streak;S.streak=0;save()}return missed}
const SAD=['Bạn quên mình rồi à? 🥺','Mình héo hon chờ bạn cả ngày đấy… 🥀','Hôm qua vắng bạn, buồn ghê! 😢','Tưới nước cho mình bằng vài từ mới nhé? 💧'];
const HAPPY=['Giỏi quá! Mình tươi tỉnh hẳn lên 🌻','Hôm nay chăm thế! 💪','Mình nở hoa rồi nè 🌷','Xong mục tiêu hôm nay, tuyệt vời! 🎉'];
const pick=a=>a[Math.floor(Math.random()*a.length)];
function mood(){const g=G(),t=today(),d=g.days[t]||{};if(d.met)return 'happy';if(g.lostStreak&&!d.n)return 'sad';const yest=g.days[addDays(t,-1)];if(S.lastDay&&!yest&&!d.n)return 'sad';return d.n?'ok':'idle'}
function renderGame(){const g=G(),m=mood(),em={happy:'🌻',ok:'🌷',idle:'🌱',sad:'🥀'}[m];
  $('mEm').textContent=em;$('mEm').className='mem '+(m==='sad'?'sad':m==='happy'?'happy':'');$('sMasc').textContent=em;
  $('mMsg').textContent=m==='sad'?(g.lostStreak?`Ôi, chuỗi ${g.lostStreak} ngày mất rồi… ${pick(SAD)}`:pick(SAD)):m==='happy'?pick(HAPPY):m==='ok'?'Tiếp tục nào, bạn đang làm rất tốt! 🌷':'Hôm nay học vài từ nhé? 🌱';
  $('flame').style.fontSize=(26+Math.min(S.streak,60)*0.7)+'px';$('flame').style.filter=S.streak?'none':'grayscale(1)';
  $('streakTxt').textContent=`${S.streak}-day streak`;$('freezeTxt').textContent=`🧊 ${g.freezes}/2 freezes`+(S.streak?'':' · start one today!');
  const L=level(g.xp);$('lvlTxt').textContent=`Level ${L.n} · ${g.xp} XP`;$('xpbar').style.width=(L.into/L.need*100)+'%';$('xpTxt').textContent=`${L.need-L.into} XP to level ${L.n+1}`;
  const t=today(),first=Object.keys(g.days).filter(k=>g.days[k].n||g.days[k].met).sort()[0]||t;let html='';const start=addDays(t,-(28+(new Date(t+'T12:00:00').getDay()+6)%7));
  for(let i=0;i<35;i++){const k=addDays(start,i),d=g.days[k]||{};let cls='',txt=+k.slice(8);
    if(k>t)cls='fut';else if(d.met){cls='met';txt=d.sticker}else if(d.frozen){cls='frz';txt='🧊'}else if(k<t&&k>=first)cls='miss';if(k===t)cls+=' today';html+=`<div class="${cls}" title="${k}">${txt}</div>`}
  $('cal').innerHTML=html;$('badges').innerHTML=BADGES.map(([id,name])=>`<span class="${g.badges.includes(id)?'':'lock'}">${name}</span>`).join('');
  $('moreRound').hidden=!(S.doneCount>=S.goal&&g.showMore)}
function checkBadges(){const g=G();BADGES.forEach(([id,name,f])=>{if(!g.badges.includes(id)&&f(g)){g.badges.push(id);setTimeout(()=>celebrate('🏅 Badge: '+name),900)}})}
let actx=null;function beep(ok){const g=G();if(!g.sound)return;try{if(navigator.vibrate)navigator.vibrate(ok?20:[30,40,30]);actx=actx||new (window.AudioContext||window.webkitAudioContext)();const o=actx.createOscillator(),v=actx.createGain();o.type='sine';o.frequency.value=ok?880:220;v.gain.value=.08;o.connect(v);v.connect(actx.destination);o.start();if(ok)o.frequency.setValueAtTime(1320,actx.currentTime+.08);o.stop(actx.currentTime+.18)}catch(e){}}
function reward(g){const G_=G(),t=today();G_.total++;const d=G_.days[t]=G_.days[t]||{};d.n=(d.n||0)+1;
  if(g===2){G_.combo++;G_.best=Math.max(G_.best,G_.combo)}else G_.combo=0;
  const mult=G_.combo>=10?3:G_.combo>=5?2:G_.combo>=3?1.5:1,xp=Math.round([1,5,10][g]*mult),before=level(G_.xp).n;G_.xp+=xp;
  $('combo').textContent=G_.combo>=3?`⚡ ${G_.combo} combo ×${mult}`:'';const xg=$('xpGain');xg.textContent='+'+xp+' XP';xg.classList.add('on');clearTimeout(xg._t);xg._t=setTimeout(()=>xg.classList.remove('on'),700);
  const sm=$('sMasc');sm.classList.remove('j','s');void sm.offsetWidth;sm.classList.add(g===2?'j':'s');sm.textContent=g===2?'🌻':g===1?'🌷':'🥀';beep(g>0);
  if(level(G_.xp).n>before)setTimeout(()=>celebrate('🎓 Level '+level(G_.xp).n+'!'),500);
  if(G_.combo===5||G_.combo===10||G_.combo===25)toast('⚡ '+G_.combo+' in a row!');
  if(S.doneCount>=S.goal&&!d.met){d.met=1;d.sticker=STICKERS[(dayDiff('2026-01-01',t)%STICKERS.length+STICKERS.length)%STICKERS.length];G_.lostStreak=0;G_.showMore=1;
    if(S.streak>0&&S.streak%7===0&&G_.freezes<2){G_.freezes++;setTimeout(()=>toast('🧊 Earned a streak freeze!'),1800)}
    setTimeout(()=>toast('Sticker of the day: '+d.sticker),1400)}
  checkBadges()}

// ---- Grammar exercises (content from the private word file)
const brk=s=>[...s.matchAll(/\[(.*?)\]/g)].map(m=>m[1]);const clean=s=>s.replace(/\[(.*?)\]/g,'$1');
function gReveal(p,it,ok,extra){const hl=esc(it.vi).replace(/\[(.*?)\]/g,'<b class="hl">$1</b>');
  return `${extra||''}<div class="gpat">${esc(p.pattern)}</div><small>${esc(p.explain)}</small><br>${hl} <button class="say" data-say="${esc(clean(it.vi))}">🔊</button><br><small>${esc(it.en)}</small>`}
function gFinish(g,html,cls){const it=sess.q[sess.i],r=$('gRev');r.className='reveal '+cls;r.innerHTML=html;r.hidden=false;finishQ('gramBox',g,it)}
function showGram(item){const p=S.gdata.points[item.g],it=p.items[Math.random()*p.items.length|0],b=brk(it.vi);sess.gi={p,it};
  ['gOpts','gFill','gReo','gBuild','gSelf','gRev'].forEach(id=>$(id).hidden=true);$('gPat').textContent='';$('gPrompt').textContent='';$('gSent').textContent='';
  let t=item.t;const words=it.vi.replace(/\[(.*?)\]/g,m=>m.replace(/ /g,'\u00a0')).split(' ');if(t==='reorder'&&(words.length<3||words.length>10||/ – /.test(it.vi)))t='choose';
  $('gLab').textContent={choose:'📐 Chọn mẫu đúng · Pick the pattern',fill:'📐 Điền từ còn thiếu · Fill the gap',reorder:'📐 Sắp xếp câu · Put the words in order',build:'📐 Đặt câu · Build a sentence'}[t];sess.gt=t;
  if(t==='choose'){const parts=p.distractors.map(d=>d.split(/\s*…\s*/));let full=parts.every(x=>x.length===b.length)&&b.length>1;
    const right=full?b.join(' … '):b[0];let k=0;$('gSent').innerHTML=esc(it.vi).replace(/\[(.*?)\]/g,(m,x)=>(full||k++===0)?'<span class="gap">&nbsp;?&nbsp;</span>':esc(x));
    const opts=[right,...parts.map(x=>full?x.join(' … '):x[0])].filter((o,i,arr)=>arr.findIndex(z=>plain(z)===plain(o))===i).sort(()=>Math.random()-.5);
    $('gOpts').innerHTML=opts.map(o=>`<button data-o="${esc(o)}">${esc(o)}</button>`).join('');$('gOpts').hidden=false;
    $('gOpts').querySelectorAll('button').forEach(x=>x.onclick=()=>{if(sess.done)return;const ok=x.dataset.o===right;$('gOpts').querySelectorAll('button').forEach(y=>{y.disabled=true;if(y.dataset.o===right)y.classList.add('ok')});if(!ok)x.classList.add('no');
      gFinish(ok?2:0,gReveal(p,it,ok,ok?'🎉 Đúng rồi!':'💭 Chưa đúng —'),ok?'ok':'no')})}
  else if(t==='fill'){let k=0;$('gSent').innerHTML=esc(it.vi).replace(/\[(.*?)\]/g,(m,x)=>k++===0?'<span class="gap">&nbsp;?&nbsp;</span>':esc(x));$('gPrompt').textContent=it.en;$('gIn').value='';$('gIn').disabled=false;$('gCheck').hidden=false;$('gFill').hidden=false}
  else if(t==='reorder'){sess.chips=words.map((w,i)=>({w,i}));sess.ans=[];$('gPrompt').textContent=it.en;let sh=sess.chips.slice();for(let n=0;n<5&&sh.map(x=>x.i).join()===sess.chips.map(x=>x.i).join();n++)sh.sort(()=>Math.random()-.5);sess.pool=sh;renderChips();$('gReo').hidden=false}
  else{$('gPat').textContent='Mẫu: '+p.pattern;$('gPrompt').textContent='Dùng mẫu này để nói: “'+it.en+'”';$('gTxt').value='';$('gTxt').disabled=false;sess.gshown=0;$('gShow').hidden=false;$('gBuild').hidden=false}}
function renderChips(){const mk=(arr,cls)=>arr.map((c,j)=>`<button data-j="${j}">${esc(c.w)}</button>`).join('');$('gChips').innerHTML=mk(sess.pool);$('gAns').innerHTML=mk(sess.ans);
  $('gChips').querySelectorAll('button').forEach(b=>b.onclick=()=>{if(sess.done)return;sess.ans.push(sess.pool.splice(+b.dataset.j,1)[0]);renderChips()});
  $('gAns').querySelectorAll('button').forEach(b=>b.onclick=()=>{if(sess.done)return;sess.pool.push(sess.ans.splice(+b.dataset.j,1)[0]);renderChips()})}
function gCheckFill(){if(sess.done)return;const {p,it}=sess.gi,want=plain(brk(it.vi)[0]),v=plain($('gIn').value);if(!v)return toast('Type your answer ✏️');$('gIn').disabled=true;$('gCheck').hidden=true;
  const k=v===want?'ok':lev(v,want)<=(want.length>6?2:1)?'close':'no';gFinish({ok:2,close:1,no:0}[k],gReveal(p,it,0,{ok:'🎉 Chính xác!',close:'🤏 Gần đúng!',no:'💭 Đáp án:'}[k]+' <b>'+esc(brk(it.vi)[0])+'</b>'),k)}
function gCheckReo(){if(sess.done)return;if(sess.pool.length)return toast('Use all the words 🧩');const {p,it}=sess.gi,ok=plain(sess.ans.map(c=>c.w).join(' '))===plain(sess.chips.map(c=>c.w).join(' '));
  gFinish(ok?2:0,gReveal(p,it,ok,ok?'🎉 Đúng rồi!':'💭 Câu đúng là:'),ok?'ok':'no')}
function gShowModel(){if(sess.done||sess.gshown)return;sess.gshown=1;const {p,it}=sess.gi;$('gShow').hidden=true;$('gTxt').disabled=true;const r=$('gRev');r.className='reveal';r.innerHTML=gReveal(p,it,0,'✍️ Câu mẫu:');r.hidden=false;
  r.querySelectorAll('[data-say]').forEach(x=>x.onclick=()=>speak(x.dataset.say));$('gSelf').hidden=false}
function gSelfGrade(g){if(sess.done)return;$('gSelf').hidden=true;$('gTxt').disabled=false;sess.gshown=0;const it=sess.q[sess.i];record(cur(),g,it);sess.done=true;$('qNext').hidden=false;if(g===2)confetti(30)}
const GS={learn:'To learn',practiced:'Practiced',learned:'Learned'};
function renderGram(){const el=$('gList');if(!hasGram()){$('gSum').innerHTML='';el.innerHTML='<div class="empty"><span class="e">📐</span><b>No grammar yet</b><br>Go to More → 🔄 Update words and pick your my-words.json (v3).</div>';$('gStart').hidden=true;return}
  $('gStart').hidden=!settings().gon;const cnt={learn:0,practiced:0,learned:0};Object.values(S.gram).forEach(x=>cnt[x.s]++);
  $('gSum').innerHTML=Object.keys(cnt).map(k=>`<div class="${k}">${cnt[k]}<br><small>${GS[k]}</small></div>`).join('');
  el.innerHTML=S.gdata.groups.map(g=>{const ps=Object.values(S.gdata.points).filter(p=>p.group===g.n),c={learn:0,practiced:0,learned:0};ps.forEach(p=>c[(S.gram[p.id]||{}).s||'learn']++);
    const bar=['learned','practiced','learn'].map(k=>`<i class="${k}" style="width:${c[k]/ps.length*100}%"></i>`).join('');
    return `<details class="ggrp"><summary>${g.n}. ${esc(g.title)} <span class="muted">· ${c.learned}/${ps.length} learned</span><div class="gbar">${bar}</div></summary>`+ps.map(p=>`<div class="gpt"><div><b>${esc(p.pattern)}</b><small>${esc(p.explain)}</small></div><select data-g="${p.id}">${Object.keys(GS).map(k=>`<option value="${k}"${(S.gram[p.id]||{}).s===k?' selected':''}>${GS[k]}</option>`).join('')}</select></div>`).join('')+'</details>'}).join('');
  el.querySelectorAll('select').forEach(s=>s.onchange=()=>{const st=S.gram[s.dataset.g];st.s=s.value;st.lv=s.value==='practiced'?1:0;st.due=Date.now()+(s.value==='learned'?LEARNED_IV0:0);save();toast('Moved ✓');renderGram()})}
// ---- new card types
const plain=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[đĐ]/g,'d').toLowerCase().replace(/\(.*?\)/g,'').replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
function lev(a,b){const m=a.length,n=b.length;let p=Array.from({length:n+1},(_,j)=>j);for(let i=1;i<=m;i++){const q=[i];for(let j=1;j<=n;j++)q[j]=Math.min(p[j]+1,q[j-1]+1,p[j-1]+(a[i-1]===b[j-1]?0:1));p=q}return p[n]}
const answers=c=>c.vi.replace(/\(.*?\)/g,'').split(/[\/;,]/).map(s=>s.replace(/\.\.\.|…|\+/g,' ').trim()).filter(s=>s.length>1);
const sylls=s=>plain(s).split(' ').filter(Boolean).length;
function distractors(c){const all=cards(),idx=all.indexOf(c),want=sylls(c.sent.blank),bad=new Set([plain(c.sent.blank),...answers(c).map(plain)]);
  const ok=w=>w!==c&&!/\.\.\.|…|\+|\//.test(w.vi)&&!bad.has(plain(answers(w)[0]||''))&&answers(w)[0];
  const near=all.slice(Math.max(0,idx-60),idx+60).filter(ok),pool=[...near.filter(w=>sylls(answers(w)[0])===want),...near,...all.filter(w=>ok(w)&&sylls(answers(w)[0])===want)];
  const out=[];for(const w of pool.sort(()=>Math.random()-.5)){const a=answers(w)[0];if(!out.some(x=>plain(x)===plain(a)))out.push(a);if(out.length===2)break}return out}
function revealHTML(c,ok){const s=c.sent,hl=esc(s.vi).replace(esc(s.blank),'<b class="hl">'+esc(s.blank)+'</b>');return `${hl} <button class="say" data-say="${esc(s.vi)}">🔊</button><br><small>${esc(s.en||c.en)}</small>`}
function finishQ(box,g,item){record(cur(),g,item);sess.done=true;const b=$(box);b.classList.remove('pop','wig');void b.offsetWidth;b.classList.add(g===2?'pop':'wig');if(g===2)confetti(30);$('qNext').hidden=false;setTimeout(()=>$('qNext').scrollIntoView({block:'center',behavior:SAFE?'auto':'smooth'}),60);
  document.querySelectorAll('#'+box+' [data-say]').forEach(x=>x.onclick=()=>speak(x.dataset.say))}
function showPick(c){const s=c.sent;$('pSent').innerHTML=esc(s.vi).replace(esc(s.blank),'<span class="gap">&nbsp;?&nbsp;</span>');$('pRev').hidden=true;
  const opts=[s.blank,...distractors(c)].sort(()=>Math.random()-.5);
  $('pOpts').innerHTML=opts.map(o=>`<button data-o="${esc(o)}">${esc(o)}</button>`).join('');
  $('pOpts').querySelectorAll('button').forEach(b=>b.onclick=()=>{if(sess.done)return;const right=b.dataset.o===s.blank;
    $('pOpts').querySelectorAll('button').forEach(x=>{x.disabled=true;if(x.dataset.o===s.blank)x.classList.add('ok')});if(!right)b.classList.add('no');
    const r=$('pRev');r.className='reveal '+(right?'ok':'no');r.innerHTML=(right?'🎉 Đúng rồi! ':'💭 Not quite — ')+'<br>'+revealHTML(c);r.hidden=false;finishQ('pickBox',right?2:0)})}
function showType(c){sess.hint=false;$('tEn').textContent=c.en;$('tIn').value='';$('tIn').disabled=false;$('tRev').hidden=true;$('tCheck').hidden=false;$('tHint').disabled=$('tShow').disabled=false;setTimeout(()=>{try{$('tIn').focus()}catch(e){}},50)}
function typeResult(kind){const c=cur(),r=$('tRev'),ans=answers(c);$('tIn').disabled=true;$('tCheck').hidden=true;$('tHint').disabled=$('tShow').disabled=true;
  const g=kind==='ok'?(sess.hint?1:2):kind==='close'?1:0;
  const msg={ok:sess.hint?'👍 Đúng rồi (with a hint)':'🎉 Chính xác!',close:'🤏 Gần đúng! Check the spelling:',no:'💭 The answer is:',shown:'👀 The answer is:'}[kind];
  r.className='reveal '+(kind==='ok'?'ok':kind==='close'?'close':'no');r.innerHTML=`${msg}<br><b class="hl">${esc(c.vi)}</b> <button class="say" data-say="${esc(ans[0]||c.vi)}">🔊</button>`+(c.sent?`<br><small>${esc(c.sent.vi)}</small>`:'');r.hidden=false;finishQ('typeBox',g)}
function checkType(){if(sess.done)return;const v=plain($('tIn').value);if(!v)return toast('Type your answer ✏️');const ans=answers(cur()).map(plain);
  if(ans.includes(v))return typeResult('ok');const d=Math.min(...ans.map(a=>lev(v,a)));const tol=Math.max(...ans.map(a=>a.length))>6?2:1;typeResult(d<=tol?'close':'no')}
function init(){if(inited)return renderHome();inited=true;show('home');
  $('tCheck').onclick=checkType;$('gCheck').onclick=gCheckFill;$('gIn').addEventListener('keydown',e=>{if(e.key==='Enter')gCheckFill()});$('gReoCheck').onclick=gCheckReo;
  $('gUndo').onclick=()=>{if(!sess.done&&sess.ans.length){sess.pool.push(sess.ans.pop());renderChips()}};$('gShow').onclick=gShowModel;document.querySelectorAll('#gSelf button').forEach(b=>b.onclick=()=>gSelfGrade(+b.dataset.sg));
  $('gStart').onclick=()=>{startSession('gram');show('study')};$('gmixSel').value=S.gmix==null?20:S.gmix;$('gmixSel').onchange=e=>{S.gmix=+e.target.value;save()};settings();$('gonToggle').checked=S.gon;$('gmixSel').disabled=!S.gon;$('gonToggle').onchange=e=>{S.gon=e.target.checked;$('gmixSel').disabled=!S.gon;save();try{renderGram()}catch(x){}};$('tIn').addEventListener('keydown',e=>{if(e.key==='Enter')checkType()});
  $('tHint').onclick=()=>{if(sess.done)return;sess.hint=true;const a=answers(cur())[0]||cur().vi;$('tIn').placeholder='Bắt đầu bằng: '+a[0]+'…';toast('💡 Starts with “'+a[0]+'”')};
  $('tShow').onclick=()=>{if(!sess.done)typeResult('shown')};$('qNext').onclick=()=>{sess.i++;showCard()};
  settings();$('tyFlash').checked=S.types.flash;$('tyPick').checked=S.types.pick;$('tyType').checked=S.types.type;$('mixSel').value=S.mix;$('fdirSel').value=S.fdir;$('fdirSel').onchange=e=>{S.fdir=e.target.value;save()};
  [['tyFlash','flash'],['tyPick','pick'],['tyType','type']].forEach(([id,k])=>$(id).onchange=e=>{S.types[k]=e.target.checked;if(!S.types.flash&&!S.types.pick&&!S.types.type){S.types.flash=true;$('tyFlash').checked=true}save()});
  $('mixSel').onchange=e=>{S.mix=e.target.value;save()};
  document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>show(b.dataset.v));
  $('startBtn').onclick=()=>{if(S.g)S.g.showMore=0;sess=null;show('study')};$('quitBtn').onclick=()=>{sess=null;show('home')};
  $('card').onclick=e=>{if(e.target.classList.contains('say'))return;$('card').classList.toggle('flip')};
  $('say1').onclick=$('say2').onclick=()=>cur()&&speak(cur().vi);
  document.querySelectorAll('.grade button[data-g]').forEach(b=>b.onclick=()=>answer(+b.dataset.g));
  let sx,sy;const cd=$('card');cd.addEventListener('touchstart',e=>{sx=e.touches[0].clientX;sy=e.touches[0].clientY},{passive:true});
  cd.addEventListener('touchend',e=>{const dx=e.changedTouches[0].clientX-sx,dy=e.changedTouches[0].clientY-sy;if(Math.abs(dx)>70&&Math.abs(dx)>Math.abs(dy))answer(dx>0?2:0);else if(dy<-70)answer(1)});
  document.querySelectorAll('#wtabs button').forEach(b=>b.onclick=()=>{tab=b.dataset.s;shown=60;renderWords()});
  $('q').oninput=()=>{shown=60;renderWords()};$('more').onclick=()=>{shown+=100;renderWords()};
  $('addBtn').onclick=()=>{const vi=$('nvi').value.trim(),en=$('nen').value.trim();if(!vi||!en)return toast('Need word + meaning');const id='u'+Date.now().toString(36);
    S.cards[id]={id,vi,en,ex:$('nex').value.trim(),s:'learn',lv:0,due:Date.now(),seen:0,ok:0,miss:0,user:1};save();$('nvi').value=$('nen').value=$('nex').value='';celebrate('➕ Added: '+vi,false)};
  if(![...$('goalSel').options].some(o=>o.value==S.goal))$('goalSel').add(new Option(S.goal+' (custom)',S.goal),$('goalSel').options.length-1);$('goalSel').value=S.goal;$('sndToggle').checked=G().sound;$('sndToggle').onchange=e=>{G().sound=e.target.checked;save();beep(true)};$('sessSel').value=S.sessN;$('goalSel').onchange=e=>{let v=e.target.value;if(v==='custom'){v=parseInt(prompt('Daily goal (cards per day):',S.goal),10);if(!(v>0&&v<=1000)){e.target.value=S.goal;return}if(![...e.target.options].some(o=>o.value==v))e.target.add(new Option(v+' (custom)',v),e.target.options.length-1);e.target.value=v}S.goal=+v;save()};
  $('moreBtn').onclick=()=>{G().showMore=0;sess=null;show('study')};$('sessSel').onchange=e=>{S.sessN=+e.target.value;save()};
  $('expBtn').onclick=()=>{const b=new Blob([JSON.stringify(S)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='tuvung-backup-'+today()+'.json';a.click()};
  $('impBtn').onclick=()=>$('impFile').click();
  $('impFile').onchange=e=>e.target.files[0]&&handleFile(e.target.files[0],false);
  $('impBtn').textContent=Object.keys(S.cards).length?'🔄 Update words (keeps your progress)':'📥 Import word list / backup';$('ver').textContent='Offline-ready · '+cards().length+' words';
  renderHome();
}
function welcome(){document.body.classList.add('welcome');$('v-welcome').classList.add('on')}
async function handleFile(file,fromWelcome){try{if(!fromWelcome&&S&&Object.keys(S.cards).length&&/^\s*\{\s*"v"/.test((await file.slice(0,40).text()))&&!confirm('This is a progress backup and will REPLACE your current progress. Continue?'))return;const r=importText(await file.text(),file.name);toast(r==='progress'?'Progress restored ✓':(`🌸 +${r.added} new · ${r.updated} updated`+(r.gram?` · 📐 ${r.gram.points} grammar`:'')));confetti(120);
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
window.__app={flashDir,get sess(){return sess},showCard,startSession,gramQueue,mergeGrammar,checkStreak,level,renderHome,saveNow,mergeWords,pickType,plain,lev,buildQueue,grade,get S(){return S},PRAC_IV,LEARNED_IV0};
