// Lossless, append-only archives for offline Heirs Ad Astra simulations.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib');
const ROOT=path.resolve(__dirname,'../..'),FORMAT='galactic-reach-simulation/1',COMPACT_FORMAT='galactic-reach-simulation/2';
const RECORDER_SOURCE=fs.readFileSync(__filename,'utf8');
const active=new Set();let handlers=false;
const plain=x=>x===undefined?null:JSON.parse(JSON.stringify(x));
const hash=x=>crypto.createHash('sha256').update(typeof x==='string'||Buffer.isBuffer(x)?x:JSON.stringify(x)).digest('hex');
function resultDirectory(base){base=path.resolve(base);fs.mkdirSync(base,{recursive:true});return fs.mkdtempSync(path.join(base,'run-'));}
function atomic(file,value){const tmp=file+'.tmp';fs.writeFileSync(tmp,JSON.stringify(value,null,2)+'\n');fs.renameSync(tmp,file);}
function freezeSource(file,content,pool,digest=hash(content)){
 if(!pool){fs.writeFileSync(file,content);return digest;}
 fs.mkdirSync(pool,{recursive:true});const blob=path.join(pool,digest+'.source');
 if(!fs.existsSync(blob)){
  const temporary=path.join(pool,'.source-'+crypto.randomUUID()+'.tmp');
  try{fs.writeFileSync(temporary,content,{flag:'wx'});try{fs.linkSync(temporary,blob);}catch(error){if(error.code!=='EEXIST')throw error;}}
  finally{if(fs.existsSync(temporary))fs.unlinkSync(temporary);}
 }
 if(!fs.lstatSync(blob).isFile()||hash(fs.readFileSync(blob))!==digest)throw Error('Frozen source pool hash mismatch: '+digest);
 // A new hard link atomically replaces only this archive's path, never blob bytes.
 const temporary=file+'.link-'+crypto.randomUUID();
 try{fs.linkSync(blob,temporary);fs.renameSync(temporary,file);}
 catch(error){if(error.code==='EXDEV')throw Error('Frozen source pool and archives must share a filesystem');throw error;}
 finally{if(fs.existsSync(temporary))fs.unlinkSync(temporary);}
 return digest;
}
function patch(before,after,at=[],out=[]){
 if(JSON.stringify(before)===JSON.stringify(after))return out;
 if(before&&after&&!Array.isArray(before)&&!Array.isArray(after)&&typeof before==='object'&&typeof after==='object'){
  // Replacing objects whose key order changed preserves exact serialized states too.
  const old=Object.keys(before),next=Object.keys(after),shared=old.filter(k=>k in after);
  if(JSON.stringify(next)!==JSON.stringify([...shared,...next.filter(k=>!(k in before))])){out.push({path:at,value:after});return out;}
  for(const k of old)if(!(k in after))out.push({path:[...at,k],remove:true});
  for(const k of next)if(!(k in before))out.push({path:[...at,k],value:after[k]});else patch(before[k],after[k],[...at,k],out);
 }else out.push({path:at,value:after});
 return out;
}
function applyPatch(state,changes){
 for(const change of changes){if(!change.path.length){state=plain(change.value);continue;}let at=state;for(const key of change.path.slice(0,-1))at=at[key];const key=change.path.at(-1);if(change.remove)delete at[key];else Object.defineProperty(at,key,{value:plain(change.value),writable:true,enumerable:true,configurable:true});}
 return state;
}
class SimulationArchive{
 constructor({directory=process.env.GR_SIMULATION_ARCHIVE_DIR||path.join(ROOT,'output/simulations'),metadata={},sources={},rulebookSource=null,sourcePool=process.env.GR_SIMULATION_SOURCE_POOL_DIR||null,layout=process.env.GR_SIMULATION_ARCHIVE_LAYOUT||'tree'}={}){
  if(!['tree','compact'].includes(layout))throw Error('Unknown simulation archive layout: '+layout);
  this.compact=layout==='compact';
  this.sourcePool=sourcePool?path.resolve(sourcePool):null;
  fs.mkdirSync(directory,{recursive:true});this.directory=fs.mkdtempSync(path.join(path.resolve(directory),this.compact&&Number.isSafeInteger(metadata.id)&&metadata.id>=0?'game-'+String(metadata.id).padStart(6,'0')+'-':'game-'));this.file=path.join(this.directory,'trace.partial.jsonl');this.fd=fs.openSync(this.file,'wx');this.previous=null;this.randomCalls=0;this.index=0;this.depth=0;this.closed=false;
  if(!this.compact)fs.mkdirSync(path.join(this.directory,'sources'));const sourceHashes={};
  for(const [name,content] of Object.entries(sources)){if(!/^[a-zA-Z0-9_.-]+$/.test(name))throw Error('Unsafe archive source name');sourceHashes[name]=freezeSource(this.sourceFile(name),content,this.sourcePool);}
  for(const [name,file] of [['recorder.cjs',__filename],['rulebook.html',path.join(ROOT,'prototypes/galactic-reach/rulebook.html')]])if(fs.existsSync(file)){const text=file===__filename?RECORDER_SOURCE:rulebookSource??fs.readFileSync(file,'utf8');sourceHashes[name]=freezeSource(this.sourceFile(name),text,this.sourcePool);}
  this.manifest={format:this.compact?COMPACT_FORMAT:FORMAT,...(this.compact?{sourceLayout:'flat'}:{}),status:'running',createdAt:new Date().toISOString(),node:process.version,metadata:plain(metadata),sourceHashes,...(this.sourcePool?{sourceStorage:{kind:'immutable-hard-links',pool:this.sourcePool}}:{}),trace:'trace.partial.jsonl',retention:'No local automatic deletion'};
  this.writeManifest();this.write({type:'header',format:this.manifest.format,metadata:plain(metadata)});active.add(this);
  if(!handlers){handlers=true;process.once('exit',code=>{for(const recorder of active)recorder.finish({reason:'process-exit',exitCode:code,incomplete:true});});process.once('uncaughtExceptionMonitor',error=>{for(const recorder of active)recorder.finish({reason:'uncaught-exception',incomplete:true,error:{message:error.message,stack:error.stack}});});}
 }
 sourceFile(name){return path.join(this.directory,this.compact?'source-'+name:path.join('sources',name));}
 addSources(sources){for(const [name,content] of Object.entries(sources)){if(!/^[a-zA-Z0-9_.-]+$/.test(name))throw Error('Unsafe archive source name');const digest=hash(content);if(this.manifest.sourceHashes[name]&&this.manifest.sourceHashes[name]!==digest)throw Error('Archive source collision');if(!this.manifest.sourceHashes[name]){freezeSource(this.sourceFile(name),content,this.sourcePool,digest);this.manifest.sourceHashes[name]=digest;}}this.writeManifest();}
 writeManifest(){atomic(path.join(this.directory,'manifest.json'),this.manifest);}
 write(record,sync=false){fs.writeFileSync(this.fd,JSON.stringify(record)+'\n');if(sync)fs.fsyncSync(this.fd);}
 random(fn){return()=>{const value=fn();if(!this.closed)this.write({type:'random',sequence:this.randomCalls++,value});return value;};}
 event(event){if(!this.closed){this.write({type:'event',event:plain(event)});if(this.getState&&['action','round-end','production','draw'].includes(event.type))this.checkpoint('event-state',{eventType:event.type,eventName:event.name||null});}}
 attach(getState,context={},getCounters=()=>({})){this.getState=getState;this.getCounters=getCounters;this.context=context;this.checkpoint(this.previous?'engine-resume':'initial');}
 checkpoint(type,extra={}){if(this.closed)return;const state=plain(this.getState?.()),counters=plain(this.getCounters?.()||{});this.write({type,index:this.index++,context:plain(this.context),...extra,rngCalls:this.randomCalls,...(this.previous===null?{state}:{patch:patch(this.previous,state)}),stateHash:hash(state),counters,snapshotHash:hash({state,counters})},['initial','after-decision','end'].includes(type));this.previous=state;}
 invoke(command,fn){
  if(this.depth)return fn();
  this.checkpoint('before-decision',{command:plain(command)});this.depth++;
  try{const result=fn();this.depth--;this.checkpoint('after-decision',{command:plain(command),result:plain(result)});if(this.getState()?.winner!==null&&this.getState()?.winner!==undefined)this.finish({reason:'victory'});return result;}
  catch(error){this.depth--;this.finish({reason:'error',incomplete:true,error:{name:error.name,message:error.message,stack:error.stack}});throw error;}
 }
 finish(outcome={}){
  if(this.closed){if(outcome.summary){if(this.compact)this.manifest.summaryInline=plain(outcome.summary);else{atomic(path.join(this.directory,'summary.json'),outcome.summary);this.manifest.summary='summary.json';}this.writeManifest();}return;}
  this.checkpoint('end',{outcome:plain(outcome)});fs.closeSync(this.fd);this.fd=null;
  const compressed=path.join(this.directory,'trace.jsonl.gz');fs.writeFileSync(compressed+'.tmp',zlib.gzipSync(fs.readFileSync(this.file)));fs.renameSync(compressed+'.tmp',compressed);
  this.closed=true;active.delete(this);const state=this.previous;
  this.manifest={...this.manifest,status:outcome.error?'failed':outcome.incomplete?'incomplete':state?.winner!==null&&state?.winner!==undefined?'complete':'incomplete',finishedAt:new Date().toISOString(),records:this.index,trace:'trace.jsonl.gz',traceHash:hash(fs.readFileSync(compressed)),finalStateHash:hash(state),outcome:plain(outcome)};this.writeManifest();fs.unlinkSync(this.file);
  if(outcome.summary){if(this.compact){this.manifest.summaryInline=plain(outcome.summary);this.writeManifest();}else atomic(path.join(this.directory,'summary.json'),outcome.summary);}
 }
}
function instrumentSource(source,event='options.simulationArchiveEvent'){
 const anchor='  if (headless && options.resume) {';if(source.split(anchor).length!==2)throw Error('Simulation archive bootstrap anchor changed');
 const hook=`
  if(${event}){
    const emit=${event};
    const resources=()=>state?.players?.map(p=>({id:p.id,stock:{...p.resources},limits:{...p.resourceLimits}}))||[];
    const log_=logEvent;logEvent=(...args)=>{emit({type:'log',round:state?.round||1,args});return log_(...args);};
    const draw_=drawCards;drawCards=(p,n)=>{const hand=new Set(p.hand.map(c=>c.id));const result=draw_(p,n);emit({type:'draw',round:state?.round||1,player:p.id,requested:n,cards:p.hand.filter(c=>!hand.has(c.id))});return result;};
    let productionBucket=null;
    const add_=addResources;addResources=(p,g)=>{const before={...p.resources},result=add_(p,g);if(productionBucket)for(const r of RESOURCES){productionBucket[p.id].gross[r]+=(g[r]||0);productionBucket[p.id].lost[r]+=(result.lost?.[r]||0);}emit({type:'resource-gain',round:state?.round||1,player:p.id,requested:g,before,after:p.resources,result});return result;};
    const pay_=payCost;payCost=(p,...args)=>{const before={...p.resources},result=pay_(p,...args);emit({type:'resource-payment',round:state?.round||1,player:p.id,args,before,after:p.resources,result});return result;};
    const production_=produceAll;produceAll=()=>{const before=resources(),prior=productionBucket,bucket=state.players.map(()=>({gross:Object.fromEntries(RESOURCES.map(r=>[r,0])),lost:Object.fromEntries(RESOURCES.map(r=>[r,0]))}));productionBucket=bucket;let result;try{result=production_();}finally{productionBucket=prior;}emit({type:'production',round:state.round,before,gross:bucket.map(p=>p.gross),lost:bucket.map(p=>p.lost),after:resources()});return result;};
    const cleanup_=cleanupRound;cleanupRound=()=>{emit({type:'round-end',round:state.round,players:state.players.map((p,id)=>({id,resources:{...p.resources},limits:{...p.resourceLimits},production:aiIncome(id),prestige:calculatePrestige(id),hand:p.hand,inPlay:p.inPlay||[]}))});return cleanup_();};
    ${['bankTrade','convertCard','upgradeStarter','decommission','discardResources','trimResourcesToCapacity','respondTrade','increaseStorage','applyCombatAction','performMoveOrder','performConstructOrder','useConstructDraw','useOrderDraw','applyColonizeOrder','probeRelic','excavate','resolveHumanSpecial','useBuyEffect','buyCard','passOperations','nextBuyPlayer','offerTrade','cancelTrade','consortiumGain','consortiumExchange','finishConsortium','finishConstruct','finishColonyBuild','constructAt','buildShip','colonizePlanet','gainCard','removeHandCard','resolveCombat','executeMove'].map(name=>`if(typeof ${name}==='function'){const original=${name};${name}=(...args)=>{${({probeRelic:3,excavate:4,constructAt:4,buildShip:4,colonizePlanet:3})[name]!==undefined?`if(args[${({probeRelic:3,excavate:4,constructAt:4,buildShip:4,colonizePlanet:3})[name]}]===true)return original(...args);`:''}const before=resources(),result=original(...args);emit({type:'action',name:'${name}',round:state?.round||1,args:args.map(x=>x&&typeof x==='object'&&'deck'in x?{player:x.id}:x),before,after:resources(),result});return result;};}`).join('\n')}
  }
`;
 return source.replace(anchor,hook+'\n'+anchor);
}
function* archiveRecords(directory){
 const manifest=JSON.parse(fs.readFileSync(path.join(directory,'manifest.json'),'utf8'));
 if(![FORMAT,COMPACT_FORMAT].includes(manifest.format))throw Error('Unsupported simulation archive format: '+manifest.format);
 if(manifest.format===COMPACT_FORMAT&&manifest.sourceLayout!=='flat')throw Error('Invalid compact simulation source layout');
 const file=path.join(directory,manifest.trace);
 for(const [name,expected] of Object.entries(manifest.sourceHashes)){const source=path.join(directory,manifest.format===COMPACT_FORMAT?'source-'+name:path.join('sources',name));if(hash(fs.readFileSync(source))!==expected)throw Error('Archive source hash mismatch: '+name);}
 if(manifest.traceHash&&hash(fs.readFileSync(file))!==manifest.traceHash)throw Error('Archive trace hash mismatch');
 const text=manifest.trace.endsWith('.gz')?zlib.gunzipSync(fs.readFileSync(file)).toString():fs.readFileSync(file,'utf8');
 const lines=text.split('\n');let state=null,randomCalls=0,nextIndex=0;
 for(let i=0;i<lines.length;i++){if(!lines[i])continue;let record;try{record=JSON.parse(lines[i]);}catch(error){if(!manifest.trace.endsWith('.gz')&&i===lines.length-1)break;throw error;}
  if('state'in record)state=plain(record.state);if(record.patch)state=applyPatch(state,record.patch);if(record.stateHash&&hash(state)!==record.stateHash)throw Error('Archive state hash mismatch at '+record.index);if(record.index!==undefined&&record.index!==nextIndex++)throw Error('Archive checkpoint sequence mismatch');if(record.type==='random'){if(record.sequence!==randomCalls++)throw Error('Random stream sequence mismatch');}if(record.rngCalls!==undefined&&record.rngCalls!==randomCalls)throw Error('Random stream count mismatch');if(record.snapshotHash&&hash({state,counters:record.counters})!==record.snapshotHash)throw Error('Archive engine counter mismatch');yield {...record,position:plain(state)};
 }
}
function readArchive(directory){const records=[...archiveRecords(directory)];return{manifest:JSON.parse(fs.readFileSync(path.join(directory,'manifest.json'),'utf8')),records,state:records.at(-1)?.position||null};}

module.exports={resultDirectory,SimulationArchive,instrumentSource,archiveRecords,readArchive,patch,applyPatch,hash};
