const vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 const context=vm.createContext({document:{body:{dataset:{}},querySelector:()=>({})},location:{pathname:'/'},sessionStorage:{getItem:()=>null},fetch:async()=>new Response('',{status:200})});
 vm.runInContext(fs.readFileSync('src/main/resources/static/js/common/core.js','utf8'),context);
 const call=()=>vm.runInContext("api('/test','POST',{})",context);
 for(const status of [200,201,204]){context.fetch=async()=>new Response(status===204?null:'',{status});assert.equal(await call(),null);}
 context.fetch=async()=>new Response('  \n ',{status:200});assert.equal(await call(),null);
 context.fetch=async()=>new Response('{"saved":true}',{status:200});assert.equal((await call()).saved,true);
 context.fetch=async()=>new Response('{"saved":',{status:200});await assert.rejects(call(),{name:'SyntaxError'});
 context.fetch=async()=>new Response('{"message":"conflict"}',{status:409});await assert.rejects(call(),/conflict/);
 context.fetch=async()=>new Response('',{status:500});await assert.rejects(call(),/500/);
 console.log('PASS empty success bodies, JSON payloads, malformed JSON and HTTP errors');
})().catch(e=>{console.error(e);process.exitCode=1;});

