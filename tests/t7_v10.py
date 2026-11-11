# Synthetic-only regression tests. Run: python tests/t7_v10.py
import json, math, traceback, copy, sys
from pathlib import Path
from datetime import datetime,timedelta
from zoneinfo import ZoneInfo
from playwright.sync_api import sync_playwright
import tempfile
BASE=Path(__file__).resolve().parent.parent; OUT=Path(tempfile.mkdtemp(prefix='tuvung-v10-tests-'))
T0=datetime(2026,10,25,9,0,tzinfo=ZoneInfo('America/Los_Angeles'))
WORDS=['đi bộ','cà phê','học sinh','cảm ơn','đồng hồ','bệnh viện','gia đình','ăn cơm','điện thoại','buổi sáng','bạn bè','thư viện']
def deck(n=300):
 return {'format':'tuvung-words','version':3,'words':[{'id':f'w{i}','vi':WORDS[i%len(WORDS)]+f' {i}','en':f'synthetic meaning {i}','s':'learn','sent':{'vi':'Tôi chọn '+WORDS[i%len(WORDS)]+f' {i} hôm nay.','blank':WORDS[i%len(WORDS)]+f' {i}','en':f'I choose synthetic word {i} today.'}} for i in range(n)],'groups':[{'n':1,'title':'Synthetic test'}],'grammar':[{'id':f'g{i}','group':1,'pattern':'đang + V','explain':'Synthetic present progressive','distractors':['đã','sẽ'],'items':[{'vi':'Tôi [đang] học tiếng Việt.','en':'I am learning Vietnamese.'}]} for i in range(24)]}
DECK=deck();(OUT/'synthetic-words.json').write_text(json.dumps(DECK,ensure_ascii=False))
RESULT={'fingerprint':'45b081a9102aee3d13ad399ef2fba54f21ddbe6d099ef2779831a7fb95db6f5c','engines':{}}
# This test intentionally drives an isolated headless browser only, no desktop session or user browser/profile.
ANSWER=r'''({result='ok',variant='accented'}={})=>{
 const ss=__app.sess,it=ss.q[ss.i],c=cur(),isg=!!it.g;
 const before=JSON.parse(JSON.stringify(c)),typ=isg?('gram-'+ss.gt):it.t==='flash'?('flash-'+it.d):it.t;
 if(isg){const {p,it:gi}=ss.gi;
  if(ss.gt==='choose'){
   const b=brk(gi.vi),parts=p.distractors.map(d=>d.split(/\s*…\s*/)),full=parts.every(x=>x.length===b.length)&&b.length>1,right=full?b.join(' … '):b[0];
   [...document.querySelectorAll('#gOpts button')].find(x=>result==='miss'?x.dataset.o!==right:x.dataset.o===right).click();
  }else if(ss.gt==='fill'){
   $('gIn').value=result==='miss'?'zzzz qqqq':result==='close'?brk(gi.vi)[0]+'x':plain(brk(gi.vi)[0]);$('gCheck').click();
  }else if(ss.gt==='reorder'){
   const order=ss.chips.map(x=>x.i);if(result==='miss')order.reverse();for(const i of order){const j=ss.pool.findIndex(x=>x.i===i);document.querySelectorAll('#gChips button')[j].click()}$('gReoCheck').click();
  }else{$('gTxt').value=clean(gi.vi);$('gShow').click();document.querySelector('#gSelf button[data-sg="'+(result==='miss'?0:result==='kinda'?1:2)+'"]').click()}
 }else if(it.t==='flash'){
  $('card').click();document.querySelector('#gradeRow button[data-g="'+(result==='miss'?0:result==='kinda'?1:2)+'"]').click();
 }else if(it.t==='pick'){
  [...document.querySelectorAll('#pOpts button')].find(x=>result==='miss'?x.dataset.o!==c.sent.blank:x.dataset.o===c.sent.blank).click();
 }else{
  if(result==='hint')$('tHint').click();
  if(result==='show')$('tShow').click();else{
   const a=answers(c)[0];$('tIn').value=result==='miss'?'zzzz qqqq':result==='close'?a+'x':variant==='ascii'?plain(a):variant==='nfd'?a.normalize('NFD'):a;
   $('tCheck').click();
  }
 }
 const after=JSON.parse(JSON.stringify(c));
 const row={id:c.id,typ,result,variant,before,after,grammar:isg,date:Date.now(),today:today()};
 if(__app.sess&&__app.sess.done)$('qNext').click();return row;
}'''
def ts(d):return int(d.timestamp()*1000)
def open_page(browser,tz='America/Los_Angeles',state=None,ver='v9'):
 ctx=browser.new_context(viewport={'width':390,'height':844},device_scale_factor=3,is_mobile=True,has_touch=True,locale='en-US',timezone_id=tz,service_workers='block')
 ctx.route('**/*',lambda route:route.fulfill(status=200,content_type='text/html' if route.request.url.split('?')[0].endswith('/') else 'application/javascript' if '.js' in route.request.url else 'application/json',body=(OUT/'v8-app.js').read_bytes() if '.js' in route.request.url and not 'sw.js' in route.request.url and ver=='v8' else (BASE/('index.html' if route.request.url.split('?')[0].endswith('/') else route.request.url.split('?')[0].rsplit('/',1)[-1])).read_bytes()) if route.request.url.split('?')[0].rsplit('/',1)[-1] in ['','app.js','sw.js','manifest.webmanifest'] else route.fulfill(status=404,body=''))
 pg=ctx.new_page();pg.set_default_timeout(5000);pg.clock.install(time=T0)
 if state: pg.add_init_script("if(!localStorage.getItem('tuvung-state-v1'))localStorage.setItem('tuvung-state-v1',"+json.dumps(json.dumps(state))+ ");localStorage.setItem('tuvung-safe','1');")
 else:pg.add_init_script("localStorage.setItem('tuvung-safe','1');")
 pg.goto('http://vocab-audit.test/');pg.wait_for_function('window.__app')
 if not state:
  pg.set_input_files('#seedFile',str(OUT/'synthetic-words.json'));pg.wait_for_function('__app.S&&Object.keys(__app.S.cards).length===300')
 pg.clock.run_for(1600)
 return ctx,pg

def force_card(pg,t='flash',direction='vi',s='practiced',lv=3):
 pg.evaluate('''({t,direction,s,lv})=>{const c=__app.S.cards.w0;c.s=s;c.lv=lv;c.due=Date.now();sess={q:[{c,t,d:direction}],i:0};show('study');showCard()}''',{'t':t,'direction':direction,'s':s,'lv':lv})
def snap(pg):return pg.evaluate('JSON.parse(JSON.stringify(__app.S))')
CHECKS=[]
def chk(label,ok):
 CHECKS.append({'test':label,'pass':bool(ok)});print(('PASS ' if ok else 'FAIL ')+label,flush=True)
 if not ok:raise AssertionError(label)
with sync_playwright() as p:
 b=p.chromium.launch(headless=True);ctx,pg=open_page(b,tz='America/Chicago');pg.evaluate('__app.S.goal=10000')
 for typ,dr in [('flash','vi'),('flash','en'),('pick','vi'),('type','vi')]:
  force_card(pg,typ,dr);r=pg.evaluate(ANSWER,{'result':'ok','variant':'ascii'});chk(f'{typ}/{dr}: exact answer promotes',r['after']['s']=='learned')
 for vi in ['ở','ạ','ừ','ý','ô']:
  force_card(pg,'type');pg.evaluate('vi=>{cur().vi=vi;showCard()}',vi);pg.fill('#tIn',vi);pg.click('#tCheck');chk('single-letter '+vi,pg.evaluate('cur().s')=='learned')
 pg.evaluate("__app.S.cards.w0.vi='đi bộ 0'")
 for state,lv in [('learn',0),('practiced',0),('practiced',1),('practiced',2),('practiced',3),('learned',0),('learned',4)]:
  force_card(pg,s=state,lv=lv);r=pg.evaluate(ANSWER,{'result':'kinda'});chk(f'Kinda preserves {state}/{lv}',(r['after']['s'],r['after']['lv'])==(state,lv));chk('Kinda next local midnight',pg.evaluate('due=>due===__app.dueInDays(Date.now(),1)',r['after']['due']))
 for result in ['hint','close','show']:
  for state,lv in [('practiced',3),('learned',2)]:
   force_card(pg,'type',s=state,lv=lv);r=pg.evaluate(ANSWER,{'result':result,'variant':'ascii'});chk(f'{result} keeps {state}/{lv}',(r['after']['s'],r['after']['lv'])==(state,lv));chk('no same-day hinted repeat',not pg.evaluate('__app.buildQueue(10000).some(c=>c.id==="w0")'))
 force_card(pg);before=snap(pg)['cards']['w0'];pg.evaluate("()=>{const el=$('card');for(const [name,k,y] of [['touchstart','touches',500],['touchend','changedTouches',300]]){const e=new Event(name);Object.defineProperty(e,k,{value:[{clientX:180,clientY:y}]});el.dispatchEvent(e)}}");chk('vertical gesture cannot grade',before==snap(pg)['cards']['w0'])
 force_card(pg);miss=pg.evaluate(ANSWER,{'result':'miss'});retry=pg.evaluate(ANSWER,{'result':'ok'});chk('genuine miss resets; explicit retry works',miss['after']['s']=='learn' and retry['after']['lv']==1)
 # Eligible by calendar day, including an existing v9 due time late tonight, without rewriting it.
 pg.clock.set_fixed_time(datetime(2026,11,1,9,0,tzinfo=ZoneInfo('America/Chicago')))
 pg.evaluate("()=>{const c=__app.S.cards.w0;c.s='practiced';c.lv=3;c.due=+new Date(2026,10,1,23,59,59);__app.saveNow()}")
 before=snap(pg)['cards']['w0'];chk('legacy late-today timestamp eligible',pg.evaluate('__app.buildQueue(10000).some(c=>c.id==="w0")'));chk('eligibility does not rewrite legacy due',before==snap(pg)['cards']['w0'])
 chk('fall-back calendar day is 25 hours',pg.evaluate("__app.dueInDays(+new Date(2026,10,1,0,0),1)-__app.dueInDays(+new Date(2026,10,1,0,0),0)")==25*3600000)
 pg.evaluate("__app.S.cards.w0.due=__app.dueInDays(Date.now(),1)");chk('tomorrow not served early',not pg.evaluate('__app.buildQueue(10000).some(c=>c.id==="w0")'))
 # Queue selection and ordering, grammar both on and off, and goal allowance.
 pg.evaluate("()=>{const S=__app.S;S.goal=100;S.doneDay=today();S.doneCount=0;Object.values(S.cards).forEach((c,i)=>{c.s=i<40?'practiced':i<50?'learned':'learn';c.lv=2;c.due=0});}")
 q=pg.evaluate('__app.buildQueue(70).map(c=>c.s)');chk('all 50 due before 20 new',q[:50].count('learn')==0 and q[50:]==['learn']*20)
 pg.evaluate('__app.S.goal=10');q=pg.evaluate('__app.buildQueue(70).map(c=>c.s)');chk('due reviews allowed past goal; no new past goal',len(q)==50 and 'learn' not in q)
 pg.evaluate("()=>{const S=__app.S;S.goal=30;S.doneCount=20;S.sessN=30;S.gon=true;S.gmix=50;Object.values(S.cards).forEach((c,i)=>{c.s=i<8?'practiced':'learn';c.lv=2;c.due=0});Object.values(S.gram).forEach(c=>{c.s='learn';c.due=0});__app.startSession()}")
 q=pg.evaluate("__app.sess.q.map(x=>({s:(x.c||__app.S.gram[x.g]).s,g:!!x.g}))");chk('new grammar/words together fit goal remainder',len(q)==10 and sum(x['s']=='learn' for x in q)==2);chk('due phase precedes new phase',all(x['s']!='learn' for x in q[:8]))
 pg.evaluate("()=>{__app.S.goal=100;__app.S.doneCount=0;Object.values(__app.S.cards).forEach(c=>{c.s='practiced';c.due=0});__app.startSession()}");chk('new grammar cannot crowd out word reviews',pg.evaluate('__app.sess.q.length===30&&__app.sess.q.every(x=>x.c)'))
 pg.evaluate("()=>{Object.values(__app.S.gram).forEach(c=>{c.s='practiced';c.due=0});__app.startSession()}");chk('due grammar and words both served',pg.evaluate('__app.sess.q.some(x=>x.g)&&__app.sess.q.some(x=>x.c)&&__app.sess.q.every(x=>(x.c||__app.S.gram[x.g]).s!=="learn")'))
 pg.evaluate('__app.S.gon=false;__app.startSession()');chk('grammar off respected',pg.evaluate('__app.sess.q.every(x=>x.c)'))
 # No early spot-check for either review section.
 pg.evaluate("()=>{Object.values(__app.S.cards).forEach((c,i)=>{c.s=i%2?'learned':'practiced';c.due=dueInDays(Date.now(),1)});__app.startSession()}");chk('no early learned/practiced repeats',pg.evaluate('__app.sess===null'))
 # All grammar exercise types preserve word state and can promote the point.
 for gt in ['choose','fill','reorder','build']:
  pg.evaluate("t=>{const c=__app.S.gram.g0;c.s='practiced';c.lv=3;c.due=0;sess={q:[{g:'g0',t}],i:0};show('study');showCard()}",gt);before=snap(pg)['cards'];r=pg.evaluate(ANSWER,{'result':'ok'});chk('grammar '+gt,r['after']['s']=='learned' and before==snap(pg)['cards'])
 pg.evaluate("()=>{delete __app.S.gdata.points.g0.distractors;sess={q:[{g:'g0',t:'choose'}],i:0};show('study');showCard()}");chk('optional grammar distractors cannot crash',pg.locator('#gOpts button').count()>0);pg.evaluate("__app.S.gdata.points.g0.distractors=['đã','sẽ']")
 # Real locator-click grammar build grading, including partial credit and a miss.
 for g in [2,1,0]:
  pg.evaluate("()=>{const c=__app.S.gram.g0;c.s='practiced';c.lv=3;c.due=0;sess={q:[{g:'g0',t:'build'}],i:0};show('study');showCard()}")
  pg.fill('#gTxt','Tôi đang học tiếng Việt.');pg.click('#gShow');pg.click(f'#gSelf button[data-sg="{g}"]')
  c=pg.evaluate('JSON.parse(JSON.stringify(__app.S.gram.g0))');chk('grammar build locator grade '+str(g),(c['s'],c['lv'])==({2:('learned',0),1:('practiced',3),0:('learn',0)}[g]))
 # Reload and word-list merge preserve existing due/lv/settings exactly.
 pg.evaluate("__app.S.goal=100;__app.S.fdir='en';__app.S.gon=false;__app.saveNow()");before=snap(pg);pg.reload();pg.wait_for_function('window.__app&&__app.S');after=snap(pg);chk('v10 reload preserves state',before==after)
 pg.click('nav button[data-v="more"]');pg.set_input_files('#impFile',str(OUT/'synthetic-words.json'));pg.clock.run_for(400);chk('word import preserves all progress',before['cards']==snap(pg)['cards'] and before['gram']==snap(pg)['gram'])
 old={'cards':before['cards'],'v':1};(OUT/'reordered-backup.json').write_text(json.dumps(old));dialogs=[];pg.on('dialog',lambda d:(dialogs.append(d.message),d.dismiss()));pg.set_input_files('#impFile',str(OUT/'reordered-backup.json'));pg.clock.run_for(400);chk('reordered backup warns before replacing',bool(dialogs));chk('cancel restore keeps progress',before['cards']==snap(pg)['cards'])
 pg.click('nav button[data-v="words"]');pg.click('#wtabs button[data-s="practiced"]');chk('word list shows stage and review date','Stage ' in pg.locator('#wlist').inner_text())
 # Learned notification is not swallowed by daily goal or session end.
 pg.evaluate('__app.S.goal=50;__app.S.doneCount=49;__app.S.lastDay=null;__app.S.doneDay=today()');force_card(pg);pg.evaluate(ANSWER,{'result':'ok'});pg.clock.run_for(200);chk('promotion toast survives daily goal','Learned:' in pg.locator('#toast').inner_text())
 ctx.close()
 # Boot v10 with the exact state generated by original v9 script, preserving lv, due and settings.
 ctx,pg=open_page(b);pg.evaluate("__app.S.goal=75;__app.S.sessN=30;__app.S.fdir='en';__app.S.gon=false;__app.S.mix='20,40,40';__app.S.types={flash:true,pick:false,type:true};Object.values(__app.S.cards).forEach((c,i)=>{c.s=['learn','practiced','learned'][i%3];c.lv=i%4;c.due=Date.now()+i*123456});__app.saveNow()")
 state=snap(pg);ctx.close()
 # Synthetic v9-shaped fixture; integration audit additionally boots original v9 code.
 v9=state
 ctx,pg=open_page(b,state=v9);v10=snap(pg);chk('v9 -> v10 all cards exact',v9['cards']==v10['cards']);chk('v9 -> v10 all grammar exact',v9['gram']==v10['gram']);chk('v9 settings retained',all(v9[k]==v10[k] for k in ['goal','sessN','fdir','gon','mix','types']));ctx.close();b.close()
chk('v10 cache scope protects other apps',"startsWith('tuvung-')" in (BASE/'sw.js').read_text())
(OUT/'v10-assertions.json').write_text(json.dumps(CHECKS,ensure_ascii=False,indent=2));print('ALL PASS',len(CHECKS))
