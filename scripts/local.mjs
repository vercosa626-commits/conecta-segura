import http from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {readFile,mkdir} from 'node:fs/promises';
import worker from '../worker/index.js';
await mkdir('.data',{recursive:true});
const db=new DatabaseSync('.data/conecta.sqlite');
// Startup migration, never executed from request handling.
db.exec('CREATE TABLE IF NOT EXISTS schema_versions (version INTEGER PRIMARY KEY)');
if(!db.prepare('SELECT version FROM schema_versions WHERE version=1').get()){
 db.exec('BEGIN');try{db.exec(await readFile('drizzle/0000_alerts.sql','utf8'));db.exec('INSERT INTO schema_versions VALUES (1)');db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}
}
const DB={prepare(sql){let params=[];return {bind(...p){params=p;return this},async first(){return db.prepare(sql).get(...params)||null},async run(){const result=db.prepare(sql).run(...params);return {meta:{changes:Number(result.changes)}}}}}};
const server=http.createServer(async(req,res)=>{try{let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>16384){res.writeHead(413);res.end('Payload too large');return}chunks.push(chunk)}const headers=new Headers(req.headers);for(const k of [...headers.keys()])if(k.startsWith('oai-authenticated-'))headers.delete(k);const request=new Request('http://'+req.headers.host+req.url,{method:req.method,headers,body:['GET','HEAD'].includes(req.method)?undefined:Buffer.concat(chunks)});const response=await worker.fetch(request,{...process.env,DB},{});res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()))}catch{res.writeHead(500);res.end('Internal error')}});
server.listen(Number(process.env.PORT||3000),'127.0.0.1',()=>console.log('Conecta Segura: http://localhost:'+Number(process.env.PORT||3000)));
