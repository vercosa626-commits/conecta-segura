import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile('src/app.js','utf8');
function harness({runtime={static:true,apiBase:'',config:{live:false}},saved={},voiceFactory=null,darkSystem=false}={}){
 const classes=new Set();const nodes=new Map(),handlers={},windowHandlers={},timers=new Map(),local=new Map(Object.entries(saved));let clock=Date.now(),timerId=0,requests=[];
 function node(selector){if(!nodes.has(selector)){const events={};const n={innerHTML:'',textContent:'',value:'',checked:false,dataset:{},events,classList:{add(){},remove(){},toggle(){}},focus(){context.document.activeElement=n},addEventListener:(key,fn)=>events[key]=fn,setPointerCapture(){},querySelector(){return null},get firstChild(){return this.innerHTML?{}:null}};nodes.set(selector,n)}return nodes.get(selector)}
 class FakeDate extends Date{static now(){return clock}}
 const context={console,URL,Date:FakeDate,Intl,Map,JSON,Math,Promise,AbortSignal,crypto,
 navigator:{onLine:true,userAgent:'test'},history:{replaceState(){}},location:{hash:'',pathname:'/conecta-segura/'},
 localStorage:{getItem:k=>local.get(k)??null,setItem:(k,v)=>local.set(k,v),removeItem:k=>local.delete(k)},
 setTimeout:(fn,ms)=>{timers.set(++timerId,{fn,ms,interval:false});return timerId},clearTimeout:id=>timers.delete(id),
 setInterval:(fn,ms)=>{timers.set(++timerId,{fn,ms,interval:true});return timerId},clearInterval:id=>timers.delete(id),
 fetch:(...args)=>{requests.push(args);return new Promise(()=>{})},
 window:{ConectaVoice:voiceFactory?{create:voiceFactory}:null,matchMedia:()=>({matches:darkSystem,addEventListener:(key,fn)=>windowHandlers.themeChange=fn}),CONECTA_RUNTIME:runtime,addEventListener:(key,fn)=>windowHandlers[key]=fn,scrollTo(){}},
 document:{body:{classList:{toggle(key,on){if(on)classes.add(key);else classes.delete(key)}},appendChild(){}},querySelector:node,querySelectorAll:()=>[],addEventListener:(key,fn)=>handlers[key]=fn,activeElement:null,hidden:false}};
 vm.createContext(context);vm.runInContext(source,context);
 return {context,nodes,classes,handlers,windowHandlers,local,requests,run:code=>vm.runInContext(code,context),node,
 tick(ms){clock+=ms;for(const [id,t] of [...timers])if(t.ms===ms){if(!t.interval)timers.delete(id);t.fn()}},
 event(n,key,extra={}){node(n).events[key]({type:key,preventDefault(){},...extra})}};
}
const contact={id:'00000000-0000-4000-8000-000000000001',name:'Contato fictício',phone:'+5592999990000',relation:'Teste',active:true,consent:true};
test('Screens, tutorial and escaped contact content',()=>{
 const h=harness();assert.match(h.node('#main').innerHTML,/Um gesto/);assert.equal(h.run('contacts.length'),0);
 for(const p of ['contatos','localizacao','ajuda','ajustes']){h.run(`navigate('${p}')`);assert.ok(h.node('#main').innerHTML.length>400)}
 h.run(`contacts=[${JSON.stringify({...contact,name:'<img src=x onerror=alert(1)>'})}];navigate('contatos')`);
 assert.doesNotMatch(h.node('#main').innerHTML,/<img src=x/);assert.match(h.node('#main').innerHTML,/&lt;img/);
 for(let i=0;i<6;i++){h.run(`tour=${i};navigate('ajuda')`);assert.match(h.node('#main').innerHTML,/Ouvir este passo/)}
});
test('Brazilian and explicit international phones reject malformed and impossible input',()=>{
 const h=harness();for(const [value,expected] of [['(92) 99999-0000','+5592999990000'],['+1 (202) 555-0100','+12025550100'],['+55 11 2345-6789','+551123456789'],['123',null],['00000000000',null],['+55 20 99999-0000',null],['+55 92 89999-0000',null],['abc92999990000',null],['++5592999990000',null]])assert.equal(h.run(`normalizePhone(${JSON.stringify(value)})`),expected,value);
});
test('Pages never calls same-origin API and prevents real mode',async()=>{
 const h=harness();await Promise.resolve();assert.equal(h.requests.length,0);h.run('setDemo(false)');assert.equal(h.run('prefs.demo'),true);
 await assert.rejects(h.run("api('/api/alerts',{method:'POST'})"),/Backend não configurado/);assert.equal(h.requests.length,0);
});
test('Missing public configuration fails safely without probing Pages API',()=>{
 const h=harness({runtime:null});assert.equal(h.requests.length,0);assert.equal(h.run('runtime.static'),true);assert.equal(h.run('prefs.demo'),true);
});
test('Countdown preserves cancel focus, cancels before send and guards duplicate requests',()=>{
 const h=harness();h.run('startCountdown()');const id=h.run('activeAlert.id');const focus=h.context.document.activeElement;
 h.tick(1000);assert.equal(h.run('activeAlert.remaining'),4);assert.equal(h.context.document.activeElement,focus);
 h.run('startCountdown()');assert.equal(h.run('activeAlert.id'),id);h.run('cancelCountdown()');h.tick(1000);
 assert.equal(h.run('activeAlert.stage'),'cancelled');assert.equal(h.requests.length,0);
 h.run('activeAlert=null;startCountdown()');for(let i=0;i<5;i++)h.tick(1000);
 assert.equal(h.run('activeAlert.stage'),'demo');assert.match(h.node('#main').innerHTML,/não enviou SMS nem WhatsApp/);
 h.run('sendAlert()');assert.equal(h.run('activeAlert.stage'),'demo');assert.equal(h.requests.length,0);
});
test('Pointer and keyboard hold, release, blur and navigation cancellation',()=>{
 for(const key of [' ','Enter']){const h=harness();h.event('#sos','keydown',{key});h.tick(75);assert.equal(h.run('activeAlert'),null);h.event('#sos','keyup',{key});h.tick(75);assert.equal(h.run('holdTimer'),null);h.event('#sos','keydown',{key});for(let i=0;i<40;i++)h.tick(75);assert.equal(h.run('activeAlert.stage'),'countdown')}
 const h=harness();h.event('#sos','pointerdown',{button:2});assert.equal(h.run('holdTimer'),null);
 h.event('#sos','pointerdown',{button:0});h.run("navigate('contatos')");assert.equal(h.run('holdTimer'),null);
 h.run("navigate('inicio')");h.event('#sos','pointerdown',{button:0});h.windowHandlers.blur();assert.equal(h.run('holdTimer'),null);
 h.event('#sos','pointerdown',{button:0});for(let i=0;i<40;i++)h.tick(75);assert.equal(h.run('activeAlert.stage'),'countdown');
 h.context.document.hidden=true;h.handlers.visibilitychange();assert.equal(h.run('activeAlert.stage'),'cancelled');
});
test('Contacts create, reject duplicate, edit, toggle and delete using form handlers',()=>{
 const h=harness();h.run('contactForm()');h.node('#contactName').value=contact.name;h.node('#contactPhone').value='(92) 99999-0000';h.node('#contactRelation').value='Teste';h.node('#contactConsent').checked=true;
 const submit=()=>h.handlers.submit({target:{id:'contactForm'},preventDefault(){}});submit();assert.equal(h.run('contacts.length'),1);
 h.run('contactForm()');submit();assert.equal(h.run('contacts.length'),1);assert.match(h.node('#contactError').textContent,/já está/);
 h.run('contactForm(contacts[0])');h.node('#contactName').value='Contato editado';submit();assert.equal(h.run('contacts[0].name'),'Contato editado');
 h.handlers.change({target:{dataset:{contactToggle:h.run('contacts[0].id')},checked:false}});assert.equal(h.run('contacts[0].active'),false);
 h.handlers.click({target:{closest:()=>({dataset:{delete:h.run('contacts[0].id')}})}});h.node('#confirmDelete').onclick();assert.equal(h.run('contacts.length'),0);
});
test('Corrupt storage recovers safely; manual links require user confirmation',()=>{
 const h=harness({saved:{'cs:/conecta-segura/:demo:contacts':'{}','cs:/conecta-segura/:demo:prefs':'null'}});assert.equal(h.run('contacts.length'),0);
 h.run(`manualContact(${JSON.stringify(contact)})`);assert.match(h.node('#modalRoot').innerHTML,/envio manual real/);assert.match(h.node('#modalRoot').innerHTML,/tocar em Enviar/);assert.match(h.node('#modalRoot').innerHTML,/sms:\+5592/);
});
test('Denied GPS, stale coordinates and offline demo stay usable',()=>{
 const h=harness();h.context.navigator.geolocation={getCurrentPosition(ok,fail){fail({code:1})}};h.run("navigate('localizacao');locate()");assert.match(h.node('#main').innerHTML,/Permissão negada/);
 h.run('position={lat:1,lng:2,time:Date.now()-120000,accuracy:5}');assert.equal(h.run('freshLocation()'),null);
 h.context.navigator.onLine=false;h.windowHandlers.offline();assert.equal(h.node('#offlineBar').hidden,false);
 h.run('startCountdown()');for(let i=0;i<5;i++)h.tick(1000);assert.equal(h.run('activeAlert.stage'),'demo');assert.equal(h.requests.length,0);
});
test('A late GPS callback cannot restore a position after stop',()=>{
 const h=harness();let resolvePosition;
 h.context.navigator.geolocation={getCurrentPosition(ok){resolvePosition=ok}};
 h.run('locate();stopLocation()');resolvePosition({coords:{latitude:1,longitude:2,accuracy:10},timestamp:Date.now()});
 assert.equal(h.run('position'),null);
});
test('Light, dark and system themes persist and leave accessibility options intact',()=>{
 const h=harness();assert.equal(h.classes.has('dark'),false);
 h.handlers.change({target:{id:'appTheme',value:'dark'}});assert.equal(h.classes.has('dark'),true);
 assert.equal(JSON.parse(h.local.get('cs:/conecta-segura/:demo:prefs')).theme,'dark');
 h.run('loadScope()');assert.equal(h.classes.has('dark'),true);
 h.handlers.change({target:{id:'appTheme',value:'light'}});assert.equal(h.classes.has('dark'),false);
 const system=harness({darkSystem:true,saved:{'cs:/conecta-segura/:demo:prefs':JSON.stringify({theme:'system',large:true,contrast:true})}});
 assert.equal(system.classes.has('dark'),true);assert.equal(system.classes.has('large-text'),true);assert.equal(system.classes.has('contrast'),true);
 system.run("navigate('ajustes')");assert.match(system.node('#main').innerHTML,/Tema do aplicativo/);assert.match(system.node('#main').innerHTML,/Automático/);
});
test('Offline manual SOS prepares SMS, can be cancelled, and never queues a send when online returns',()=>{
 const h=harness();h.context.navigator.onLine=false;h.run(`contacts=[${JSON.stringify(contact)}];startCountdown({manual:true})`);
 h.run('cancelCountdown()');for(let i=0;i<5;i++)h.tick(1000);assert.equal(h.run('activeAlert.stage'),'cancelled');
 h.run('startCountdown({manual:true})');for(let i=0;i<5;i++)h.tick(1000);
 assert.equal(h.run('activeAlert.stage'),'manual');assert.equal(h.run('activeAlert.demo'),false);assert.match(h.node('#main').innerHTML,/sms:\+5592/);assert.match(h.node('#main').innerHTML,/Nenhuma mensagem enviada/);assert.doesNotMatch(h.node('#main').innerHTML,/https:\/\/wa.me\//);
 h.context.navigator.onLine=true;h.windowHandlers.online();h.tick(1000);assert.equal(h.requests.length,0);assert.equal(h.run('activeAlert.stage'),'manual');
});
test('A connection lost during a real countdown switches to manual without requesting a provider',()=>{
 const h=harness();h.run(`config.live=true;user={displayName:'Teste',getIdToken:async()=>''};prefs.demo=false;contacts=[${JSON.stringify(contact)}];startCountdown()`);
 h.context.navigator.onLine=false;for(let i=0;i<5;i++)h.tick(1000);assert.equal(h.run('activeAlert.stage'),'manual');assert.equal(h.requests.length,0);
});
test('Voice command uses the existing cancellable SOS and stops listening when the app is hidden',()=>{
 let command,stops=0,state={status:'idle',message:'Microfone desligado.',mode:null};
 const h=harness({voiceFactory:options=>{command=options.onCommand;return {supported:true,localSupported:true,getState:()=>state,stop:()=>{stops++;state={status:'idle',mode:null}},start:async()=>true}}});
 command();assert.equal(h.run('activeAlert.stage'),'countdown');assert.ok(stops>0);
 h.context.document.hidden=true;h.handlers.visibilitychange();assert.equal(h.run('activeAlert.stage'),'cancelled');assert.ok(stops>1);assert.equal(h.requests.length,0);
});
test('Contact backup round trip preserves fields, generates safe IDs and rejects invalid files',()=>{
 const h=harness();h.run(`contacts=[${JSON.stringify(contact)}]`);const backup=h.run('JSON.stringify(contactBackup())');
 h.run(`contacts=parseContactBackup(${JSON.stringify(backup)})`);assert.equal(h.run('contacts[0].phone'),contact.phone);assert.equal(h.run('contacts[0].consent'),true);assert.notEqual(h.run('contacts[0].id'),contact.id);
 for(const payload of ['{}',JSON.stringify({app:'Conecta Segura',version:1,contacts:Array(6).fill(contact)}),JSON.stringify({app:'Conecta Segura',version:1,contacts:[{...contact,phone:'invalid'}]})])assert.throws(()=>h.run(`parseContactBackup(${JSON.stringify(payload)})`));
});
test('Import merges contacts without replacing local edits and rejects a scope change during file reading',async()=>{
 const h=harness();h.run(`contacts=[${JSON.stringify(contact)}]`);const backup=h.run('JSON.stringify(contactBackup())');h.context.testFile={files:[{size:100,text:async()=>backup}],value:'selected'};
 await h.run('importContactsFile(testFile)');assert.equal(h.run('contacts.length'),1);assert.equal(h.context.testFile.value,'');
 let finish;h.context.testFile={files:[{size:100,text:()=>new Promise(r=>finish=r)}],value:'selected'};const pending=h.run('importContactsFile(testFile)');h.run("scope='other-account'");finish(backup);await pending;assert.equal(h.run('contacts.length'),1);assert.match(h.node('#toastRoot').innerHTML,/conta mudou/);
});

test('Device mode: without a backend the SOS prepares real SMS/WhatsApp drafts, persists, and never calls the network',()=>{
 const h=harness();h.run('setDemo(false)');assert.equal(h.run('prefs.demo'),true);assert.match(h.node('#modalRoot').innerHTML,/Ativar envio pelo celular/);
 h.run('actions.enableDevice()');assert.equal(h.run('prefs.demo'),false);assert.equal(h.run('prefs.device'),true);
 const saved=JSON.parse(h.local.get('cs:/conecta-segura/:demo:prefs'));assert.equal(saved.device,true);
 const again=harness({saved:{'cs:/conecta-segura/:demo:prefs':JSON.stringify(saved)}});assert.equal(again.run('prefs.demo'),false);assert.equal(again.run('prefs.device'),true);
 h.context.navigator.geolocation={getCurrentPosition:ok=>ok({coords:{latitude:-2.1,longitude:-60.02,accuracy:12},timestamp:h.run('Date.now()')})};
 h.run(`contacts=[${JSON.stringify(contact)}];startCountdown()`);assert.equal(h.run('activeAlert.manual'),true);
 for(let i=0;i<5;i++)h.tick(1000);
 assert.equal(h.run('activeAlert.stage'),'manual');assert.equal(h.requests.length,0);
 const html=h.node('#main').innerHTML;assert.match(html,/sms:\+5592999990000/);assert.match(html,/wa\.me\/5592999990000/);assert.match(html,/tel:180/);assert.match(html,/Nenhuma mensagem enviada/);assert.match(html,/maps%2Fsearch|google\.com\/maps/);
 h.run("actions.markOpened({dataset:{mark:'"+contact.id+":sms'}})");assert.equal(h.run('activeAlert.opened["'+contact.id+':sms"]'),true);
 h.run('setDemo(true)');assert.equal(h.run('prefs.demo'),true);assert.equal(h.run('prefs.device'),false);
});
test('SMS and WhatsApp links use the right separator on Android, iPhone and iPadOS',()=>{
 const h=harness();const text='Oi & tchau? 100%';
 assert.equal(h.run(`smsHref('+5592999990000',${JSON.stringify(text)})`),'sms:+5592999990000?body='+encodeURIComponent(text));
 h.context.navigator.userAgent='Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)';
 assert.equal(h.run(`smsHref('+5592999990000',${JSON.stringify(text)})`),'sms:+5592999990000&body='+encodeURIComponent(text));
 h.context.navigator.userAgent='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)';h.context.navigator.platform='MacIntel';h.context.navigator.maxTouchPoints=5;
 assert.match(h.run(`smsHref('+5592999990000','a')`),/&body=a$/);
 assert.equal(h.run(`waHref('+55 (92) 99999-0000',${JSON.stringify(text)})`),'https://wa.me/5592999990000?text='+encodeURIComponent(text));
});
