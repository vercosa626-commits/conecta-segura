import {createHash} from 'node:crypto';

export function manifest(base = './') {
  return {id:base, name:'Conecta Segura', short_name:'Conecta',
    description:'Sua rede de confiança, sempre por perto.', lang:'pt-BR',
    start_url:base, scope:base, display:'standalone',
    background_color:'#f8f6fb', theme_color:'#6527a1',
    icons:[{src:'./icon-192.png',sizes:'192x192',type:'image/png',purpose:'any'},
      {src:'./icon-512.png',sizes:'512x512',type:'image/png',purpose:'any maskable'}]};
}

export function serviceWorker(files) {
  const version=createHash('sha256').update(JSON.stringify(files)).digest('hex').slice(0,16);
  return `const ROOT=new URL('./',self.location.href);
const PREFIX='conecta:'+ROOT.pathname+':';
const CACHE=PREFIX+'${version}';
const SHELL=${JSON.stringify(Object.keys(files))}.map(p=>new URL(p,ROOT).href);
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith(PREFIX)&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  const u=new URL(e.request.url);u.hash='';u.search='';
  if(!SHELL.includes(u.href))return;
  e.respondWith(caches.open(CACHE).then(async c=>{
    const cached=await c.match(u.href);if(cached)return cached;
    try{const r=await fetch(e.request);if(r.ok&&!r.redirected)await c.put(u.href,r.clone());return r}catch{return Response.error()}
  }));
});
self.addEventListener('message',e=>{
  if(e.data?.type!=='CHECK_OFFLINE')return;
  e.waitUntil(caches.open(CACHE).then(async c=>{
    const entries=await Promise.all(SHELL.map(url=>c.match(url)));
    e.source?.postMessage({type:'OFFLINE_STATUS',ready:entries.every(Boolean)});
  }));
});`;
}
