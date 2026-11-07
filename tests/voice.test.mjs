import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile('src/voice.js','utf8');
function setup({supported=true,local=true,availability='available',online=true,visible=true}={}){
 let commands=0,starts=0,downloads=0,aborts=0;const instances=[],states=[],timers=new Map();let timerId=0;
 class Native{
  constructor(){if(local)this.processLocally=false;instances.push(this)}
  start(){starts++;this.onstart?.()}
  abort(){aborts++;this.onend?.()}
  static async available(){return availability}
  static async install(options){assert.deepEqual(Array.from(options.langs),['pt-BR']);downloads++;return true}
 }
 const root=supported?{SpeechRecognition:Native}:{};
 vm.runInNewContext(source,{window:root,setTimeout:(fn,ms)=>{timers.set(++timerId,{fn,ms});return timerId},clearTimeout:id=>timers.delete(id)});
 const engine=root.ConectaVoice.create({onCommand:()=>commands++,onState:s=>states.push(s),isOnline:()=>online,isVisible:()=>visible});
 return {engine,Native,instances,states,timers,stats:()=>({commands,starts,downloads,aborts}),online:value=>online=value,visible:value=>visible=value,
 result(text,{final=true,confidence=0.95}={}){const result=[{transcript:text,confidence}];result.isFinal=final;instances.at(-1).onresult?.({resultIndex:0,results:[result]})}};
}
test('Voice is off until explicitly activated; exact final commands trigger only once',async()=>{
 const h=setup();assert.equal(h.stats().starts,0);assert.equal(h.engine.getState().status,'idle');
 await h.engine.start('browser');assert.equal(h.engine.getState().status,'listening');assert.equal(h.instances.at(-1).lang,'pt-BR');
 for(const text of ['ajuda','não conecta preciso de ajuda','eu disse conecta preciso de ajuda agora'])h.result(text);
 h.result('Conecta, preciso de ajuda.',{final:false});h.result('Conecta, preciso de ajuda.',{confidence:0.2});assert.equal(h.stats().commands,0);
 const late=h.instances.at(-1).onresult;h.result('Conecta, preciso de ajuda.');h.result('Conecta, preciso de ajuda.');
 late({resultIndex:0,results:[Object.assign([{transcript:'Conecta, preciso de ajuda.'}],{isFinal:true})]});assert.equal(h.stats().commands,1);assert.equal(h.engine.getState().status,'idle');
});
test('Offline recognition explicitly uses local Portuguese and never silently switches to a cloud service',async()=>{
 const h=setup({online:false});assert.equal(await h.engine.start('browser'),false);assert.equal(h.stats().starts,0);
 assert.equal(await h.engine.start('local'),true);assert.equal(h.instances.at(-1).processLocally,true);h.result('Conecta, ativar emergência!');assert.equal(h.stats().commands,1);
 const missing=setup({availability:'downloadable'});assert.equal(await missing.engine.start('local'),false);assert.equal(missing.engine.getState().status,'needs-download');assert.equal(missing.stats().starts,0);assert.equal(missing.stats().downloads,0);
 await missing.engine.download();assert.equal(missing.stats().downloads,1);assert.equal(missing.stats().starts,0);
 const absent=setup({availability:'unavailable'});await absent.engine.start('local');assert.equal(absent.stats().starts,0);assert.equal(absent.engine.getState().status,'error');
});
test('Unsupported devices, permission denial, network loss and cancellation fail without sending a command',async()=>{
 const unsupported=setup({supported:false});assert.equal(unsupported.engine.supported,false);assert.equal(await unsupported.engine.start('browser'),false);
 const noLocal=setup({local:false});assert.equal(noLocal.engine.localSupported,false);assert.equal(await noLocal.engine.start('local'),false);
 const h=setup();await h.engine.start('browser');h.instances.at(-1).onerror({error:'not-allowed'});assert.match(h.engine.getState().message,/não autorizado/);assert.equal(h.stats().commands,0);
 await h.engine.start('browser');h.engine.stop();assert.equal(h.engine.getState().status,'idle');assert.equal(h.stats().commands,0);
 await h.engine.start('browser');h.visible(false);h.result('Conecta, preciso de ajuda');assert.equal(h.stats().commands,0);
});
test('Leaving during an asynchronous model check cannot start the microphone later',async()=>{
 const h=setup();let available;h.Native.available=()=>new Promise(r=>available=r);
 const start=h.engine.start('local');h.engine.stop();available('available');assert.equal(await start,false);assert.equal(h.stats().starts,0);
});
test('Repeated activation is ignored and timeout or native end never restarts listening',async()=>{
 const h=setup();await h.engine.start('browser');assert.equal(await h.engine.start('browser'),false);assert.equal(h.stats().starts,1);
 [...h.timers.values()][0].fn();assert.equal(h.engine.getState().status,'idle');assert.equal(h.stats().starts,1);
 await h.engine.start('browser');h.instances.at(-1).onend();assert.equal(h.engine.getState().status,'idle');assert.equal(h.stats().starts,2);
});
