// Synthetic responses only: never create bookings, accounts or Square transactions.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const origin = `https://${process.env.REPLIT_DEV_DOMAIN}`;
const libs = execFileSync('sh',['-c',"find /nix/store -path '*/lib/libgbm.so.1' -o -path '*/lib/libasound.so.2' 2>/dev/null | xargs -n1 dirname | paste -sd:"],{encoding:'utf8'}).trim();
const browser = await chromium.launch({env:{...process.env,LD_LIBRARY_PATH:libs+':'+(process.env.LD_LIBRARY_PATH||'')}});
const out = '../../generated-artifacts/widgets';
mkdirSync(out,{recursive:true});
try {
for(const width of [375,1280]) for(const embedded of [false,true]) {
  const page=await browser.newPage({viewport:{width,height:850}});
  let failed=false, posts=0;
  await page.route('**/api/**', async route=>{
    const path=new URL(route.request().url()).pathname;
    let body={};
    if(path.endsWith('/availability')) body={slots:[],totalTables:1};
    if(path.endsWith('/blocked-periods')) body=[];
    if(path.endsWith('/dining-hours')) body={overrides:[]};
    if(path==='/api/bookings') { posts++; body={id:posts,status:'confirmed'}; }
    await route.fulfill({status:failed?503:200,contentType:'application/json',body:JSON.stringify(body)});
  });
  const url=origin+'/widget/booking';
  await page.goto(url);
  if(embedded) {
    await page.evaluate(url=>{document.body.innerHTML='<iframe title="test widget" style="width:100%;height:760px;border:0"></iframe>';document.querySelector('iframe').src=url;},url);
  }
  const frame=embedded?await (await page.locator('iframe').elementHandle()).contentFrame():page;
  await frame.locator('[data-type=pool]').click();
  await frame.locator('#poolTableGrid [data-num="1"]').click();
  await frame.locator('#step1Next').click();
  await frame.locator('#nextDate').click();
  await frame.locator('.time-btn:not(:disabled)').first().click();
  await frame.locator('#step2Next').click();
  await frame.locator('#custName').fill('Synthetic Customer');
  await frame.locator('#custEmail').fill('synthetic@example.invalid');
  await frame.locator('#custPhone').fill('07000000000');
  await frame.locator('#gdprCheck').check();
  await frame.locator('#step3 .btn-outline').click();
  await frame.locator('.time-btn.selected').waitFor();
  assert.equal(await frame.locator('#step2Next').isDisabled(),false);
  failed=true;
  await frame.locator('#nextDate').click();
  await frame.getByText('Retry availability',{exact:true}).waitFor();
  assert.equal(await frame.locator('.time-btn').count(),0);
  assert.equal(await frame.locator('#step2Next').isDisabled(),true);
  failed=false;
  await frame.getByText('Retry availability',{exact:true}).click();
  await frame.locator('.time-btn:not(:disabled)').first().click();
  await frame.locator('#step2Next').click();
  assert.equal(await frame.locator('#custName').inputValue(),'Synthetic Customer');
  await frame.locator('#step3 .btn-primary').click();
  await frame.locator('#confirmBtn').click();
  await frame.locator('#step5').waitFor({state:'visible'});
  await frame.getByText('Make Another Booking',{exact:true}).click();
  assert.equal(await frame.locator('#confirmBtn').isDisabled(),false);
  await frame.locator('[data-type=darts]').click();
  await frame.locator('#step1Next').click();
  await frame.locator('#nextDate').click();
  await frame.locator('.time-btn:not(:disabled)').first().click();
  await frame.locator('#step2Next').click();
  await frame.locator('#custName').fill('Second Customer');
  await frame.locator('#custEmail').fill('second@example.invalid');
  await frame.locator('#custPhone').fill('07000000000');
  await frame.locator('#gdprCheck').check();
  await frame.locator('#step3 .btn-primary').click();
  await frame.locator('#confirmBtn').click();
  await frame.locator('#step5').waitFor({state:'visible'});
  assert.equal(posts,2);
  assert(await frame.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:`${out}/after-booking-${width}-${embedded?'iframe':'standalone'}.png`});
  await page.close();
}
// Out-of-order availability: deliberately let the first (aborted) response
// arrive after the newer date response and verify it cannot replace current data.
{
  const page=await browser.newPage({viewport:{width:375,height:850}});
  let availabilityCount=0, releaseFirst, markFirstSeen;
  const firstSeen=new Promise(resolve=>{markFirstSeen=resolve});
  const firstGate=new Promise(resolve=>{releaseFirst=resolve});
  await page.route('**/api/**',async route=>{
    const path=new URL(route.request().url()).pathname;
    let body={};
    if(path.endsWith('/availability')) {
      availabilityCount++;
      if(availabilityCount===1) {
        markFirstSeen();
        await firstGate;
        body={slots:[{startTime:'17:00',duration:1}],totalTables:1};
      } else body={slots:[],totalTables:1};
    }
    if(path.endsWith('/blocked-periods')) body=[];
    if(path.endsWith('/dining-hours')) body={overrides:[]};
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
  });
  const url=origin+'/widget/booking';
  await page.goto(url);
  await page.evaluate(url=>{document.body.innerHTML='<iframe title="out-of-order booking widget" style="width:100%;height:760px;border:0"></iframe>';document.querySelector('iframe').src=url;},url);
  const frame=await (await page.locator('iframe').elementHandle()).contentFrame();
  await frame.locator('[data-type=pool]').click();
  await frame.locator('#poolTableGrid [data-num="1"]').click();
  await frame.locator('#step1Next').click();
  await firstSeen;
  await frame.locator('#nextDate').click();
  await frame.locator('.time-btn:not(:disabled)').first().waitFor();
  releaseFirst();
  await page.waitForTimeout(100);
  const lateSlot=frame.locator('.time-btn').filter({hasText:'5:00pm'});
  assert.equal(await lateSlot.count(),1);
  assert.equal(await lateSlot.isDisabled(),false,'late response for the old date must not replace newer availability');
  assert(availabilityCount>=2,'both date availability requests should have been issued');
  await page.screenshot({path:`${out}/booking-out-of-order-iframe-375.png`});
  await page.close();
}
// A seven-guest dining booking must remain pending until synthetic Square
// confirmation; this test never opens the synthetic checkout URL.
{
  const page=await browser.newPage({viewport:{width:375,height:850}});
  let posts=0;
  await page.route('**/api/**',async route=>{
    const path=new URL(route.request().url()).pathname;
    let body={};
    if(path.endsWith('/availability')) body={slots:[],totalTables:1};
    if(path.endsWith('/blocked-periods')) body=[];
    if(path.endsWith('/dining-hours')) body={overrides:[]};
    if(path==='/api/bookings') {
      posts++;
      body={id:8123,status:'pending_deposit',depositRequired:true,depositPaymentUrl:'https://payments.example.invalid/booking-deposit'};
    }
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
  });
  const url=origin+'/widget/booking';
  await page.goto(url);
  await page.evaluate(url=>{document.body.innerHTML='<iframe title="deposit pending booking widget" style="width:100%;height:760px;border:0"></iframe>';document.querySelector('iframe').src=url;},url);
  const frame=await (await page.locator('iframe').elementHandle()).contentFrame();
  await frame.locator('[data-type=dining]').click();
  await frame.locator('#guestGrid [data-num="7"]').click();
  await frame.locator('#step1Next').click();
  await frame.locator('.time-btn:not(:disabled)').first().click();
  await frame.locator('#step2Next').click();
  await frame.locator('#custName').fill('Synthetic Deposit Customer');
  await frame.locator('#custEmail').fill('deposit@example.invalid');
  await frame.locator('#custPhone').fill('07000000000');
  await frame.locator('#gdprCheck').check();
  await frame.locator('#step3 .btn-primary').click();
  await frame.locator('#confirmBtn').click();
  await frame.locator('#stepDeposit').waitFor({state:'visible'});
  assert.equal(posts,1);
  assert.match(await frame.locator('#depositPaidSection').innerText(),/Payment is pending until Square confirms/i);
  assert.equal(await frame.locator('#depositFallback').getAttribute('href'),'https://payments.example.invalid/booking-deposit');
  await frame.locator('#stepDeposit button.btn-navy').click();
  await frame.locator('#step5').waitFor({state:'visible'});
  assert.match(await frame.locator('#successTitle').innerText(),/Booking Pending Confirmation/i);
  assert.match(await frame.locator('#successMessage').innerText(),/Once your £5.00 deposit payment is confirmed/i);
  assert(await frame.locator('#pendingDepositLink').isVisible());
  assert.equal(await frame.locator('#pendingDepositLink').getAttribute('href'),'https://payments.example.invalid/booking-deposit');
  await page.screenshot({path:`${out}/booking-deposit-pending-iframe-375.png`});
  await page.close();
}
console.log('Booking: repeat/back/failure/retention/overflow passed; out-of-order availability and 7-guest deposit-pending recovery passed in the widget iframe with synthetic APIs.');
} finally { await browser.close(); }
