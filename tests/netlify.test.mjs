import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createHandler, config} from '../netlify/functions/api.mjs';
import {postgresStore} from '../src/postgres-store.js';
import {buildPages} from '../scripts/build-pages.mjs';

const origin='https://conecta.example.test';
const enabled={LIVE_ALERTS_ENABLED:'true',FIREBASE_PUBLIC_CONFIG:JSON.stringify({apiKey:'test-public',projectId:'test',authDomain:'test.firebaseapp.com'}),TWILIO_ACCOUNT_SID:'ACtest',TWILIO_AUTH_TOKEN:'test-secret',TWILIO_SMS_FROM:'+15555550100'};
function memoryStore(){const rows=new Map();return {rows,health:async()=>true,find:async id=>rows.get(id)||null,get:async(owner,id)=>rows.get(id)?.owner===owner?rows.get(id):null,async reserve({id,owner,created,initial}){if(rows.has(id)||[...rows.values()].some(r=>r.owner===owner&&r.created>created-30000))return false;rows.set(id,{owner,created,status:'processing',results:JSON.stringify(initial)});return true},async update(owner,id,results,status){const row=rows.get(id);if(row?.owner===owner){row.results=JSON.stringify(results);if(status)row.status=status}},prune:async()=>{}}}
const body=()=>({id:crypto.randomUUID(),type:'geral',name:'Teste fictício',contacts:[{name:'Contato fictício',phone:'+15555550101',consent:true}],location:null});
const request=(path,method='GET',data,token='test-token',requestOrigin=origin)=>new Request(origin+path,{method,headers:{Origin:requestOrigin,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:method==='POST'?JSON.stringify(data):undefined});

test('Netlify build uses root PWA paths, same-origin API and no embedded provider credentials',async()=>{
 const out=await buildPages({directory:'dist-netlify',staticMode:false,apiBase:'',manifestBase:'/'});
 const runtime={window:{}};vm.runInNewContext(await readFile(out+'/runtime-config.js','utf8'),runtime);assert.equal(runtime.window.CONECTA_RUNTIME.static,false);assert.equal(runtime.window.CONECTA_RUNTIME.apiBase,'');
 const manifest=JSON.parse(await readFile(out+'/manifest.webmanifest','utf8'));assert.equal(manifest.start_url,'/');assert.equal(manifest.scope,'/');assert.equal(manifest.id,'/');
 assert.doesNotMatch(await readFile(out+'/sw.js','utf8'),/\/api\//);
 assert.doesNotMatch(await readFile(out+'/runtime-config.js','utf8'),/test-secret|postgres:|TWILIO_AUTH_TOKEN/);
 assert.deepEqual(config.rateLimit.aggregateBy,['ip','domain']);
});
test('Function exposes real configuration and storage health independently of messaging',async()=>{
 const handler=createHandler({env:{TWILIO_AUTH_TOKEN:'must-stay-secret'},getStore:()=>memoryStore()});
 const r=await handler(request('/api/config'));assert.equal(r.status,200);assert.match(r.headers.get('Cache-Control'),/no-store/);assert.equal(r.headers.get('Netlify-CDN-Cache-Control'),'no-store');const c=await r.json();assert.equal(c.backend,true);assert.equal(c.storage,true);assert.equal(c.live,false);assert.doesNotMatch(JSON.stringify(c),/must-stay-secret/);
 assert.equal((await handler(request('/api/health'))).status,200);
 assert.equal((await handler(request('/.netlify/functions/api/config'))).status,200);
 const failing=createHandler({env:enabled,getStore:()=>({health:async()=>{throw Error('private database URL')}})});
 const unavailable=await failing(request('/api/health'));assert.equal(unavailable.status,503);assert.doesNotMatch(await unavailable.text(),/private database URL/);
 const closed=await(await failing(request('/api/config'))).json();assert.equal(closed.storage,false);assert.equal(closed.live,false);
});
test('Functions enforce auth, origin, validation and durable-store idempotency across separate handlers',async()=>{
 const previous=global.fetch,store=memoryStore();let sends=0;
 global.fetch=async(url,options)=>{if(String(url).includes('accounts:lookup'))return Response.json({users:[{localId:options.body.includes('other-token')?'other':'owner'}]});if(String(url).includes('twilio.com')){sends++;return Response.json({sid:'SM-test',status:'queued'})}throw Error('Unexpected external call')};
 try{
  const first=createHandler({env:enabled,getStore:()=>store}),second=createHandler({env:enabled,getStore:()=>store}),payload=body();
  assert.equal((await first(request('/api/alerts','POST',payload,null))).status,401);
  assert.equal((await first(request('/api/alerts','POST',payload,'test-token','https://evil.test'))).status,403);
  assert.equal((await first(request('/api/alerts','POST',{...payload,type:'constructor'}))).status,400);assert.equal(sends,0);
  const results=await Promise.all([first(request('/api/alerts','POST',payload)),second(request('/api/alerts','POST',payload))]);assert.deepEqual(results.map(r=>r.status),[200,200]);assert.equal(sends,1);
  const own=await second(request('/api/alerts/'+payload.id));assert.equal(own.status,200);assert.doesNotMatch(await own.text(),/SM-test|test-secret|1555555|owner/);
  assert.equal((await second(request('/api/alerts/'+payload.id,'GET',null,'other-token'))).status,404);
  assert.equal((await first(request('/api/alerts','POST',body()))).status,429);assert.equal(sends,2,'one send plus one status query; no second provider POST');
 }finally{global.fetch=previous}
});
test('A failed durable reservation never calls a messaging provider',async()=>{
 const previous=global.fetch;let providerCalls=0;
 global.fetch=async url=>{if(String(url).includes('accounts:lookup'))return Response.json({users:[{localId:'owner'}]});providerCalls++;throw Error('must not contact provider')};
 try{const store=memoryStore();store.reserve=async()=>{throw Error('postgres://private-credential')};const handler=createHandler({env:enabled,getStore:()=>store});const r=await handler(request('/api/alerts','POST',body()));assert.equal(r.status,503);assert.doesNotMatch(await r.text(),/private-credential/);assert.equal(providerCalls,0)}finally{global.fetch=previous}
});
test('PostgreSQL reservation rolls back and releases its connection on failure',async()=>{
 const commands=[];let released=false;
 const client={async query(sql){commands.push(sql);if(sql.startsWith('SELECT COUNT'))return {rows:[{total:0,latest:null}]};if(sql.startsWith('INSERT'))throw Error('storage failure');return {rows:[]}},release(){released=true}};
 const store=postgresStore({connect:async()=>client});await assert.rejects(store.reserve({id:crypto.randomUUID(),owner:'fake-owner',created:Date.now(),initial:[]}),/storage failure/);
 assert.equal(commands[0],'BEGIN');assert.match(commands[1],/pg_advisory_xact_lock/);assert.equal(commands.at(-1),'ROLLBACK');assert.equal(released,true);
});
test('Preview and unpublished deploys keep messaging disabled despite production credentials',async()=>{
 const handler=createHandler({env:enabled,getStore:()=>memoryStore()});
 for(const deploy of [{context:'deploy-preview',published:false},{context:'production',published:false}]){
  const c=await(await handler(request('/api/config'),{deploy})).json();assert.equal(c.live,false);
  assert.equal((await handler(request('/api/alerts','POST',body()),{deploy})).status,503);
 }
});
test('Read-only database is not reported as ready and cannot enable messaging',async()=>{
 const handler=createHandler({env:enabled,getStore:()=>({health:async()=>false})});
 const c=await(await handler(request('/api/config'))).json();assert.equal(c.storage,false);assert.equal(c.live,false);
 assert.equal((await handler(request('/api/health'))).status,503);
 const store=postgresStore({query:async()=>({rows:[{ready:false}]})});assert.equal(await store.health(),false);
});
