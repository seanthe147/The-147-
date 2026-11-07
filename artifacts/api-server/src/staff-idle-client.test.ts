import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFileSync} from "node:fs";
const code=readFileSync(new URL("./templates/assets/staff-idle.js",import.meta.url),"utf8");

function harness(duration=900_000, delayedResponse?:()=>Promise<Response>){
  let now=1_800_000_000_000, scrubbed=false;
  const listeners:Record<string,Function>={}, intervals:Function[]=[], timers:Function[]=[];
  const data=new Map([["staffToken147","test-token"],["staffIdle147",JSON.stringify({token:"test-token",deadline:now+duration})]]);
  const requests:any[]=[], redirects:string[]=[];
  const buttons:Record<string,any>={};
  const dialog:any={open:false,style:{},setAttribute(){},querySelector(s:string){return buttons[s]??=(s==="#staffIdleMessage"?{textContent:""}:{addEventListener(_n:string,fn:Function){this.click=fn;}});},addEventListener(){},showModal(){this.open=true;},close(){this.open=false;}};
  const doc:any={visibilityState:"visible",documentElement:{style:{}},body:{replaceChildren(){scrubbed=true;},appendChild(){}},createElement:(tag:string)=>tag==="dialog"?dialog:{},addEventListener:(n:string,fn:Function)=>listeners[n]=fn};
  const localStorage={getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>data.set(k,v),removeItem:(k:string)=>data.delete(k)};
  const win:any={location:{href:"https://test.test/staff",origin:"https://test.test",pathname:"/staff",replace:(s:string)=>redirects.push(s)},
    addEventListener:(n:string,fn:Function)=>listeners[n]=fn,
    fetch:async(input:any,init:any)=>{
      requests.push({input,init});
      if (delayedResponse && String(input)==="/api/bookings") return delayedResponse();
      return new Response("{}",{headers:String(input).endsWith("/activity")?{"X-Staff-Idle-Expires-At":new Date(now+900_000).toISOString(),"X-Staff-Server-Time":new Date(now).toISOString()}:{}});
    }};
  const context=vm.createContext({window:win,document:doc,localStorage,Date:{now:()=>now,parse:Date.parse},Headers,Request,Response,URL,AbortController,AbortSignal,
    setInterval:(fn:Function)=>intervals.push(fn),setTimeout:(fn:Function)=>timers.push(fn),clearTimeout:()=>{}});
  vm.runInContext(code,context);
  win.installStaffIdle({getToken:()=>localStorage.getItem("staffToken147"),clearToken:()=>localStorage.removeItem("staffToken147")});
  return {win,doc,data,requests,redirects,dialog,buttons,listeners,timers,tick:(ms:number)=>{now+=ms;intervals.forEach(fn=>fn());},scrubbed:()=>scrubbed};
}
test("polling does not renew; warning appears and idle boundary clears confidential content",async()=>{
  const h=harness();
  await h.win.fetch("/api/bookings",{headers:{Authorization:"Bearer test-token"}});
  assert.equal(h.requests[0].init.headers.get("X-Staff-Client"),"web");
  h.tick(840_000);
  assert.equal(h.dialog.open,true);
  assert.match(h.dialog.innerHTML,/Unsaved changes/);
  h.listeners.pointermove({isTrusted:true});
  assert.equal(h.requests.length,1,"warning requires explicit continue, not incidental mouse movement");
  h.tick(60_000);
  assert.equal(h.scrubbed(),true);
  assert.equal(h.data.has("staffToken147"),false);
  assert.match(h.redirects[0],/signedOut=idle/);
  await assert.rejects(h.win.fetch("/api/bookings",{headers:{Authorization:"Bearer test-token"}}),/Session expired/);
});
test("real activity is throttled, synthetic events and focus do not renew",async()=>{
  const h=harness();
  h.listeners.pointerdown({isTrusted:false});
  h.listeners.pageshow();
  assert.equal(h.requests.length,0);
  h.listeners.pointerdown({isTrusted:true});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.requests.length,1);
  assert.equal(h.requests[0].input,"/api/staff/activity");
  h.listeners.keydown({isTrusted:true});
  h.listeners.wheel({isTrusted:true});
  assert.equal(h.requests.length,1);
});
test("explicit stay signed in extends the server-approved deadline",async()=>{
  const h=harness(60_000);h.tick(0);
  h.buttons["[data-continue]"].click({isTrusted:true});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.dialog.open,false);
  h.tick(61_000);
  assert.equal(h.scrubbed(),false);
});
test("sleeping tabs expire on resume and other-tab signout immediately clears the screen",()=>{
  const h=harness(20);
  h.doc.visibilityState="hidden";h.listeners.visibilitychange();
  assert.equal(h.doc.documentElement.style.visibility,"hidden");
  h.tick(21);h.doc.visibilityState="visible";h.listeners.pageshow();
  assert.equal(h.scrubbed(),true);
  const other=harness();
  other.data.delete("staffToken147");
  other.listeners.storage({key:"staffToken147"});
  assert.equal(other.scrubbed(),true);
});
test("another active tab shares its deadline without generating a heartbeat",()=>{
  const h=harness(40_000);
  const record=JSON.parse(h.data.get("staffIdle147")!);
  h.data.set("staffIdle147",JSON.stringify({...record,deadline:record.deadline+900_000}));
  h.listeners.storage({key:"staffIdle147"});
  h.tick(45_000);
  assert.equal(h.scrubbed(),false);
  assert.equal(h.requests.length,0);
});
test("a response arriving after expiry is rejected before it can repopulate the screen",async()=>{
  let finish!:(r:Response)=>void;
  const response=new Promise<Response>(resolve=>{finish=resolve;});
  const h=harness(100,()=>response);
  const request=h.win.fetch("/api/bookings",{headers:{Authorization:"Bearer test-token"}});
  const rejection=assert.rejects(request,/Session expired/);
  h.tick(101);
  finish(new Response(JSON.stringify([{customerName:"Must never render"}])));
  await rejection;
  assert.equal(h.scrubbed(),true);
  assert.equal(h.data.has("staffToken147"),false);
});
