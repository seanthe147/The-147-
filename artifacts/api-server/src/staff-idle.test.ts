import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { db, staffSessions, staffUsers } from "@workspace/db";
import { eq } from "drizzle-orm";
import { storage } from "./storage";
import { hashPassword } from "./encryption";
import { registerRoutes } from "./routes/routes";

test("staff web idle expiry is server enforced; native sessions and polling remain unchanged",async()=>{
  if(process.env.MEMBERSHIP_BILLING_ISOLATED_TEST!=="yes") throw new Error("Isolated test database required");
  const password="Fixture-only-Staff-Idle-2026";
  const hashed=hashPassword(password);
  const [user]=await db.insert(staffUsers).values({username:"fixture-idle",passwordHash:hashed.hash,passwordSalt:hashed.salt,mustChangePassword:false,role:"staff"}).returning();
  const app=express();app.use(express.json());
  const server=await registerRoutes(app);
  await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
  const port=(server.address() as any).port;
  const call=(path:string,token?:string,body?:any,web=false)=>fetch(`http://127.0.0.1:${port}${path}`,{
    method:body?"POST":"GET",headers:{"Content-Type":"application/json",...(token?{Authorization:`Bearer ${token}`}:{ }),...(web?{"X-Staff-Client":"web"}:{})},body:body?JSON.stringify(body):undefined,
  });
  try {
    const webLogin=await call("/api/staff/login",undefined,{username:user.username,password,client:"staff-web"});
    assert.equal(webLogin.status,200);
    const web=await webLogin.json() as {token:string;idleExpiresAt:string;serverNow:string};
    const remaining=Date.parse(web.idleExpiresAt)-Date.parse(web.serverNow);
    assert(remaining>899_000 && remaining<=900_000);
    const nativeLogin=await call("/api/staff/login",undefined,{username:user.username,password});
    assert.equal(nativeLogin.status,200);
    const native=await nativeLogin.json() as {token:string;idleExpiresAt:null};
    assert.equal(native.idleExpiresAt,null);
    const before=await storage.validateStaffSession(web.token);
    for(let i=0;i<3;i++) assert.equal((await call("/api/staff/verify",web.token,undefined,true)).status,200);
    assert.equal((await storage.validateStaffSession(web.token))?.idleExpiresAt?.getTime(),before?.idleExpiresAt?.getTime(),"polls do not renew");
    await db.update(staffSessions).set({idleExpiresAt:new Date(Date.now()+45_000)}).where(eq(staffSessions.token,web.token));
    const activity=await call("/api/staff/activity",web.token,{elapsedMs:0},true);
    assert.equal(activity.status,200);
    assert(activity.headers.get("x-staff-idle-expires-at"));
    assert((await storage.validateStaffSession(web.token))!.idleExpiresAt!.getTime()>Date.now()+890_000);
    await Promise.all([storage.recordStaffWebActivity(web.token,0),storage.recordStaffWebActivity(web.token,14_000)]);
    assert((await storage.validateStaffSession(web.token))!.idleExpiresAt!.getTime()>Date.now()+890_000,"a delayed tab cannot shorten the newer deadline");
    assert.equal((await call("/api/staff/activity",web.token,{elapsedMs:-1},true)).status,400);
    assert.equal((await call("/api/staff/activity",native.token,{elapsedMs:0})).status,401);
    assert.equal((await call("/api/staff/verify",native.token,undefined,true)).status,401,"legacy/native token cannot unlock the web portal");
    assert.equal((await call("/api/staff/verify",native.token)).status,200);
    await db.update(staffSessions).set({idleExpiresAt:new Date(Date.now())}).where(eq(staffSessions.token,web.token));
    assert.equal((await call("/api/staff/verify",web.token)).status,401,"omitting the web header cannot bypass expiry");
    assert.equal((await call("/api/staff/activity",web.token,{elapsedMs:0},true)).status,401,"late activity cannot revive expiry");
    assert.equal(await storage.recordStaffWebActivity(web.token,0),undefined,"atomic update also rejects revoked/expired sessions");
    const [revoked]=await db.select().from(staffSessions).where(eq(staffSessions.token,web.token));
    assert.equal(revoked.active,false);
    assert.equal((await call("/api/staff/verify",native.token)).status,200,"native session survives web expiry");
    await call("/api/staff/logout",native.token,{});
    assert.equal((await call("/api/staff/verify",native.token)).status,401);
  } finally {
    await db.delete(staffSessions).where(eq(staffSessions.staffUserId,user.id));
    await db.delete(staffUsers).where(eq(staffUsers.id,user.id));
    await new Promise<void>(resolve=>server.close(()=>resolve()));
  }
});
