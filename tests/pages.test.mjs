import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir,mkdir} from 'node:fs/promises';
import http from 'node:http';
import {resolve} from 'node:path';
import vm from 'node:vm';
import {buildPages} from '../scripts/build-pages.mjs';
const out=await buildPages();
const prefix='/conecta-segura/';
test('Static output contains only public assets and resolves under the project prefix',async()=>{
 const server=http.createServer(async(req,res)=>{try{const path=new URL(req.url,'http://localhost').pathname;if(!path.startsWith(prefix))throw Error();const p=path.slice(prefix.length);const file=p.endsWith('/')||!p?p+'index.html':p;const body=await readFile(resolve(out,file));res.writeHead(200);res.end(body)}catch{res.writeHead(404);res.end()}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{
  const origin='http://127.0.0.1:'+server.address().port,base=origin+prefix;
  for(const p of ['', 'app.js','voice.js','style.css','icon.svg','icon-192.png','icon-512.png','manifest.webmanifest','sw.js','runtime-config.js','implantacao/'])assert.equal((await fetch(base+p)).status,200,p);
  const html=await(await fetch(base)).text();assert.match(html,/Content-Security-Policy/);assert.doesNotMatch(html,/(?:src|href)="\/(?!\/)/);
  for(const [,link] of html.matchAll(/(?:src|href)="(\.\/[^\"]+)"/g))assert.equal((await fetch(new URL(link,base))).status,200,link);
  assert.equal((await fetch(origin+'/api/config')).status,404);
  const guide=await readFile(resolve(out,'implantacao/index.html'),'utf8');assert.match(guide,/href="\.\.\/"/);assert.doesNotMatch(guide,/sessão do proprietário no ChatGPT/);
  const manifest=JSON.parse(await readFile(resolve(out,'manifest.webmanifest'),'utf8'));assert.equal(new URL(manifest.scope,base+'manifest.webmanifest').href,base);assert.equal(new URL(manifest.start_url,base+'manifest.webmanifest').href,base);
  for(const i of manifest.icons)assert.equal((await fetch(new URL(i.src,base))).status,200);
  const runtime={window:{}};vm.runInNewContext(await readFile(resolve(out,'runtime-config.js'),'utf8'),runtime);assert.equal(runtime.window.CONECTA_RUNTIME.apiBase,'');assert.equal(runtime.window.CONECTA_RUNTIME.config.live,false);
  assert.deepEqual((await readdir(out)).sort(),['.nojekyll','app.js','voice.js','icon-192.png','icon-512.png','icon.svg','implantacao','index.html','manifest.webmanifest','runtime-config.js','style.css','sw.js'].sort());
 }finally{await new Promise(r=>server.close(r))}
});
test('Service worker installs tutorial, supports offline shell, never intercepts API or deletes another app cache',async()=>{
 const handlers={},cacheMap=new Map([['unrelated-app',new Map()],['conecta:/another-project/:old',new Map()],['conecta:/conecta-segura/:old',new Map()]]);let offline=false,claimed=false;
 const open=async name=>{if(!cacheMap.has(name))cacheMap.set(name,new Map());const cache=cacheMap.get(name);return {async match(key){return cache.get(key)?.clone()},async addAll(urls){for(const u of urls){const p=new URL(u).pathname.slice(prefix.length);const body=await readFile(resolve(out,!p||p.endsWith('/')?p+'index.html':p));cache.set(u,new Response(body))}},async put(k,v){cache.set(k,v)}}};
 const caches={open,keys:async()=>[...cacheMap.keys()],delete:async k=>cacheMap.delete(k),match:async k=>{for(const c of cacheMap.values())if(c.has(k))return c.get(k).clone()}};
 const context={URL,Response,caches,fetch:async()=>{if(offline)throw Error('offline');return new Response('online')},self:{location:{href:'https://example.test'+prefix+'sw.js'},addEventListener:(n,f)=>handlers[n]=f,skipWaiting:async()=>{},clients:{claim:async()=>{claimed=true}}}};
 vm.runInNewContext(await readFile(resolve(out,'sw.js'),'utf8'),context);
 const waits=[];handlers.install({waitUntil:p=>waits.push(p)});await Promise.all(waits);waits.length=0;handlers.activate({waitUntil:p=>waits.push(p)});await Promise.all(waits);
 assert.ok(claimed);assert.ok(cacheMap.has('unrelated-app'));assert.ok(cacheMap.has('conecta:/another-project/:old'));assert.ok(!cacheMap.has('conecta:/conecta-segura/:old'));
 offline=true;for(const path of ['', 'app.js','voice.js','implantacao/']){let result;handlers.fetch({request:{method:'GET',url:'https://example.test'+prefix+path},respondWith:p=>result=p,waitUntil(){}});assert.ok((await result).ok,path)}
 let ready;const readiness=[];handlers.message({data:{type:'CHECK_OFFLINE'},source:{postMessage:r=>ready=r},waitUntil:p=>readiness.push(p)});await Promise.all(readiness);assert.equal(ready.ready,true);
 const appCache=[...cacheMap.entries()].find(([key])=>key.startsWith('conecta:/conecta-segura/'));appCache[1].delete('https://example.test'+prefix+'voice.js');readiness.length=0;handlers.message({data:{type:'CHECK_OFFLINE'},source:{postMessage:r=>ready=r},waitUntil:p=>readiness.push(p)});await Promise.all(readiness);assert.equal(ready.ready,false);
 for(const path of ['/api/config','/api/alerts','/another-project/']){let intercepted=false;handlers.fetch({request:{method:'GET',url:'https://example.test'+path},respondWith(){intercepted=true}});assert.equal(intercepted,false,path)}
});
test('Static build rejects backend credentials, non-HTTPS and wildcard origins',async()=>{
 for(const apiBase of ['http://example.test','https://name:password@example.test','https://example.test/path','https://example.test?token=x','*'])await assert.rejects(buildPages({directory:'.qa/invalid-pages',apiBase}));
});
