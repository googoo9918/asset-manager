const http=require('node:http');
const crypto=require('node:crypto');
const {WebSocketServer}=require('ws');
const fs=require('node:fs/promises');
const path=require('node:path');
// Explicit pairing with one local extension. No remote listener, browser cookies or login requests.
function createRelay(port=18765,pairFile=path.resolve('.local/kb-card-pairing.json')){
  let server,wss,socket,code;
  const waiting=new Map();
  return {
    get connected(){return socket?.readyState===1;},
    async start(){
      if(server)return {port,code,connected:this.connected};
      if(pairFile){
        await fs.mkdir(path.dirname(pairFile),{recursive:true});
        try{code=JSON.parse(await fs.readFile(pairFile,'utf8')).code;}catch(e){if(e.code!=='ENOENT')throw new Error('저장된 Chrome 연결 설정을 읽지 못했습니다.');}
      }
      if(!code){
        code=crypto.randomBytes(24).toString('base64url');
        if(pairFile)await fs.writeFile(pairFile,JSON.stringify({code}),{flag:'wx',mode:0o600});
      }
      if(!/^[A-Za-z0-9_-]{32}$/.test(code))throw new Error('Chrome 연결 설정의 형식이 잘못되었습니다.');
      server=http.createServer((req,res)=>{res.writeHead(404);res.end();});
      wss=new WebSocketServer({noServer:true,maxPayload:8*1024*1024});
      server.on('upgrade',(request,socket,head)=>{
        let url;try{url=new URL(request.url,'http://127.0.0.1');}catch{socket.destroy();return;}
        if(!/^chrome-extension:\/\/[a-p]{32}$/.test(request.headers.origin||'')||url.pathname!=='/kb'||url.searchParams.get('code')!==code){socket.destroy();return;}
        wss.handleUpgrade(request,socket,head,ws=>wss.emit('connection',ws));
      });
      wss.on('connection',client=>{
        socket?.close();socket=client;
        client.on('message',data=>{
          if(socket!==client)return;
          let reply;try{reply=JSON.parse(data.toString());}catch{return;}
          const pending=waiting.get(reply.id);if(!pending)return;
          waiting.delete(reply.id);clearTimeout(pending.timer);
          if(reply.error){
            const message=reply.error==='지원하지 않는 조회 명령입니다.'
              ? `Chrome 확장 프로그램이 ${pending.action} 조회 명령을 지원하지 않습니다. chrome://extensions에서 ‘가계부 · KB국민카드 이용내역 가져오기’를 새로고침한 뒤 KB 탭에서 다시 연결해주세요. 기존 연결코드를 그대로 사용합니다.`
              : reply.error;
            pending.reject(new Error(message));
          }else pending.resolve(reply.result);
        });
        client.on('close',()=>{
          if(socket!==client)return;
          socket=null;for(const p of waiting.values()){clearTimeout(p.timer);p.reject(new Error('Chrome 연결이 끊겼습니다. 확장 프로그램에서 다시 연결해주세요.'));}waiting.clear();
        });
      });
      await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);}).catch(e=>{server=null;throw new Error('Chrome 연결 포트를 열지 못했습니다. 다른 가져오기 도구를 종료해주세요.');});
      return {port,code,connected:false};
    },
    async command(action,args={}){
      if(!this.connected)throw new Error('기존 Chrome의 KB 탭에서 확장 프로그램을 연결해주세요.');
      const id=crypto.randomUUID();
      return new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>{waiting.delete(id);reject(new Error('Chrome 응답이 지연되었습니다. 조회 화면과 연결 상태를 확인해주세요.'));},30000);
        waiting.set(id,{resolve,reject,timer,action});socket.send(JSON.stringify({id,action,args}));
      });
    },
    async close(){
      socket?.close();socket=null;
      for(const p of waiting.values()){clearTimeout(p.timer);p.reject(new Error('연결을 종료했습니다.'));}waiting.clear();
      wss?.close();await new Promise(resolve=>server?server.close(resolve):resolve());server=null;
    }
  };
}
module.exports={createRelay};
