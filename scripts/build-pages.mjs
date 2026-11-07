import {mkdir,readFile,writeFile,readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {manifest,serviceWorker} from './pwa.mjs';

export async function buildPages({directory='dist-pages',apiBase=process.env.PAGES_API_BASE_URL||'',staticMode=true,manifestBase='./'}={}) {
  // Never import .env or backend configuration into a public artifact.
  if(apiBase){const u=new URL(apiBase);if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||u.pathname!=='/')throw Error('PAGES_API_BASE_URL deve ser uma origem HTTPS, sem credenciais, caminho ou parâmetros.');apiBase=u.origin;}
  const out=resolve(directory);
  await mkdir(out,{recursive:true});
  for(const entry of await readdir(out,{withFileTypes:true})){
    if(entry.isSymbolicLink())throw Error('Link simbólico inesperado na saída estática.');
    if(!['index.html','style.css','app.js','voice.js','icon.svg','icon-192.png','icon-512.png','implantacao','manifest.webmanifest','runtime-config.js','sw.js','.nojekyll'].includes(entry.name))throw Error('Arquivo inesperado na saída estática: '+entry.name);
    if(entry.isDirectory()){
      if(entry.name!=='implantacao')throw Error('Diretório inesperado na saída estática.');
      for(const child of await readdir(resolve(out,entry.name),{withFileTypes:true}))if(child.name!=='index.html'||!child.isFile())throw Error('Recurso inesperado no guia estático.');
    }
  }
  const files={};
  for(const name of ['index.html','style.css','app.js','voice.js','icon.svg','icon-192.png','icon-512.png'])files['./'+name]=await readFile('src/'+name);
  files['./implantacao/']=await readFile('src/implantacao.html');
  files['./manifest.webmanifest']=JSON.stringify(manifest(manifestBase));
  files['./runtime-config.js']='window.CONECTA_RUNTIME='+JSON.stringify({static:staticMode,apiBase,config:{firebase:null,mapsKey:null,sms:false,whatsapp:false,live:false}})+';\n';
  const csp="default-src 'self'; script-src 'self' https://www.gstatic.com https://maps.googleapis.com https://maps.gstatic.com https://www.google.com https://www.recaptcha.net https://apis.google.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https://*.googleapis.com https://*.gstatic.com https://*.google.com; connect-src 'self' https://*.googleapis.com https://*.firebaseio.com https://*.google.com"+(apiBase?' '+apiBase:'')+"; frame-src https://*.firebaseapp.com https://www.google.com https://www.recaptcha.net; object-src 'none'; base-uri 'self'; form-action 'self'";
  for(const name of ['./index.html','./implantacao/'])files[name]=files[name].toString().replace('<head>','<head><meta http-equiv="Content-Security-Policy" content="'+csp+'"><meta name="referrer" content="no-referrer">');
  const shell={'./':files['./index.html'],...files};
  files['./sw.js']=serviceWorker(Object.fromEntries(Object.entries(shell).map(([p,v])=>[p,Buffer.isBuffer(v)?v.toString('base64'):v])));
  files['./.nojekyll']='';
  for(const [name,body] of Object.entries(files)){
    const target=resolve(out,name==='./implantacao/'?'implantacao/index.html':name);
    await mkdir(resolve(target,'..'),{recursive:true});await writeFile(target,body);
  }
  console.log('Versão estática gerada em '+directory+' (envio automático '+(apiBase?'depende do backend':'desativado')+').');
  return out;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await buildPages();
