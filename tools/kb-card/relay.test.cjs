const {test}=require('node:test');
const assert=require('node:assert/strict');
const {once}=require('node:events');
const {WebSocket}=require('ws');
const {createRelay}=require('./relay.cjs');
test('pairs extension, returns replies, rejects non-extension origins and stale codes',async()=>{
  const relay=createRelay(18766,null);
  let ws;
  try{
    const {code}=await relay.start();
    assert.match(code,/^[A-Za-z0-9_-]{32}$/);
    for(const [origin,token] of [['https://evil.test',code],['chrome-extension://'+'a'.repeat(32),'wrong']]){
      const bad=new WebSocket('ws://127.0.0.1:18766/kb?code='+token,{origin});
      await once(bad,'error');assert.notEqual(bad.readyState,WebSocket.OPEN);bad.terminate();
    }
    ws=new WebSocket('ws://127.0.0.1:18766/kb?code='+code,{origin:'chrome-extension://'+'a'.repeat(32)});
    await once(ws,'open');
    ws.on('message',data=>{const request=JSON.parse(data.toString());ws.send(JSON.stringify({id:request.id,result:[{tables:[]}]}));});
    assert.deepEqual(await relay.command('read'),[{tables:[]}]);
    ws.close();await once(ws,'close');
  }finally{ws?.terminate();await relay.close();}
});
test('pairing survives a relay restart without requiring a new code',async()=>{
  const fs=require('node:fs/promises'),path=require('node:path');
  const directory=await fs.mkdtemp(path.resolve('build/kb-pairing-test-'));
  const file=path.join(directory,'pairing.json');
  const first=createRelay(18766,file);
  const a=await first.start();await first.close();
  const second=createRelay(18766,file);
  try{const b=await second.start();assert.equal(a.code,b.code);}finally{await second.close();}
});
