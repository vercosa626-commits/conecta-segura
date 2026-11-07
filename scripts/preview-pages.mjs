import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
const prefix='/'+(process.env.PAGES_REPOSITORY||'conecta-segura').replace(/^\/+|\/+$/g,'')+'/';
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'};
http.createServer(async(req,res)=>{try{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname===prefix.slice(0,-1)){res.writeHead(302,{Location:prefix});return res.end();}
  if(!url.pathname.startsWith(prefix))throw Error('not found');
  const path=decodeURIComponent(url.pathname.slice(prefix.length));
  const root=resolve('dist-pages'),file=resolve(root,path+(path.endsWith('/')||!path?'index.html':''));
  if(!file.startsWith(root+sep))throw Error('not found');
  const body=await readFile(file);res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream','Cache-Control':'no-cache'});res.end(req.method==='HEAD'?undefined:body);
}catch{res.writeHead(404);res.end('Not found');}}).listen(Number(process.env.PORT||4173),'127.0.0.1',()=>console.log('Conecta Segura Pages: http://localhost:'+(process.env.PORT||4173)+prefix));
