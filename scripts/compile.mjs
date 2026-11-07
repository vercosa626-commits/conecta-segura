import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {manifest,serviceWorker} from './pwa.mjs';
const assets={};
for(const [path,file,type] of [
  ['/','index.html','text/html'],['/style.css','style.css','text/css'],
  ['/app.js','app.js','text/javascript'],['/icon.svg','icon.svg','image/svg+xml'],
  ['/voice.js','voice.js','text/javascript'],
  ['/implantacao/','implantacao.html','text/html']
]) assets[path]=[await readFile('src/'+file,'utf8'),type+'; charset=utf-8'];
assets['/manifest.webmanifest']=[JSON.stringify(manifest('/')),'application/manifest+json'];
assets['/runtime-config.js']=['window.CONECTA_RUNTIME={static:false,apiBase:""};','text/javascript; charset=utf-8'];
const pngs={};for(const n of [192,512])pngs['/icon-'+n+'.png']=(await readFile('src/icon-'+n+'.png')).toString('base64');
const shell=Object.fromEntries(Object.entries(assets).map(([p,[body]])=>['.'+p,body]));
for(const [p,body] of Object.entries(pngs))shell['.'+p]=body;
assets['/sw.js']=[serviceWorker(shell),'text/javascript; charset=utf-8'];
assets['/implantacao']=assets['/implantacao/'];
const server=await readFile('src/server.js','utf8'),handler=await readFile('src/handler.js','utf8');
await mkdir('worker',{recursive:true});
await writeFile('worker/index.js',server+'\nconst ASSETS='+JSON.stringify(assets)+';\nconst PNGS='+JSON.stringify(pngs)+';\n'+handler);
