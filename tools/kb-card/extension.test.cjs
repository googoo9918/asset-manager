const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs/promises'),path=require('node:path');
const {WebSocket}=require('ws');
const {createRelay}=require('./relay.cjs');
test('extension remembers pairing and reconnects after local server restart without user input',async()=>{
  const directory=await fs.mkdtemp(path.resolve('build/kb-extension-test-'));
  const file=path.join(directory,'pairing.json');
  let relay=createRelay(18767,file),saved={},messageHandler,alarmHandler;
  const sockets=[],intervals=[],executions=[];
  try{
    const {code}=await relay.start();
    const event=()=>({addListener(){}});
    const chrome={
      tabs:{onCreated:event(),onRemoved:event(),onUpdated:event(),get:async()=>({id:10,url:'https://card.kbcard.com/'}),query:async()=>[{id:10,url:'https://card.kbcard.com/'}]},
      storage:{local:{get:async()=>saved,set:async value=>{saved={...saved,...value};}}},
      scripting:{executeScript:async options=>{executions.push(options);return [{frameId:0,result:options.args[0]==='receipt'?{available:true}:{tables:[],controls:[]}}];}},
      alarms:{create(){},onAlarm:{addListener(fn){alarmHandler=fn;}}},
      runtime:{id:'test-extension',onStartup:event(),onInstalled:event(),onMessage:{addListener(fn){messageHandler=fn;}}}
    };
    class LocalSocket extends WebSocket{
      constructor(url){super(url.replace(':18765/',':18767/'),{origin:'chrome-extension://'+'a'.repeat(32)});sockets.push(this);}
    }
    const sandbox={chrome,WebSocket:LocalSocket,URL,setTimeout,clearTimeout,clearInterval,setInterval(fn,ms){const timer=setInterval(fn,ms);intervals.push(timer);return timer;}};
    vm.runInNewContext(await fs.readFile(path.join(__dirname,'../kb-card-extension/background.js'),'utf8'),sandbox);
    const connected=await new Promise(resolve=>messageHandler({action:'connect',tabId:10,code},{id:'test-extension'},resolve));
    assert.equal(connected.connected,true);assert.equal(saved.kbPairing.code,code);
    await relay.close();relay=createRelay(18767,file);await relay.start();
    await new Promise(resolve=>setTimeout(resolve,30));
    alarmHandler({name:'kb-reconnect'});
    for(let i=0;i<100&&!relay.connected;i++)await new Promise(resolve=>setTimeout(resolve,10));
    assert.equal(relay.connected,true);assert.equal(saved.kbPairing.code,code);
    assert.equal((await relay.command('read'))[0].tabId,10);
    assert.equal((await relay.command('receipt',{tabId:10,rowIndex:1,approval:'test'}))[0].available,true);
    assert.equal(executions.at(-1).world,'MAIN');
    assert.equal(executions.at(-1).args[0],'receipt');
    await assert.rejects(relay.command('unsupported'),/unsupported.*조회 명령.*새로고침/);
  }finally{intervals.forEach(clearInterval);sockets.forEach(s=>s.terminate());await relay.close();}
});
