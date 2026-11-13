// Browser regression coverage with browser-local synthetic APIs only.
// No real customer, membership, Square, or payment endpoint is contacted.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const origin = `https://${process.env.REPLIT_DEV_DOMAIN}`;
const libs = execFileSync('sh',['-c',"find /nix/store -path '*/lib/libgbm.so.1' -o -path '*/lib/libasound.so.2' 2>/dev/null | xargs -n1 dirname | paste -sd:"],{encoding:'utf8'}).trim();
const browser = await chromium.launch({env:{...process.env,LD_LIBRARY_PATH:libs+':'+(process.env.LD_LIBRARY_PATH||'')}});
const out = '../../generated-artifacts/widgets';
mkdirSync(out,{recursive:true});
const plans = [
  {id:101,name:'Synthetic Flexible',tier:'rack',color:'#1559C3',priceMonthly:1200,priceAnnual:12000,monthlyIntervalDays:30,minimumTermMonths:0,sortOrder:1,benefitsDetailed:[{key:'hours',text:'Synthetic 30-day access'}]},
  {id:202,name:'Synthetic Platinum',tier:'platinum',color:'#702963',priceMonthly:2000,priceAnnual:20000,monthlyIntervalDays:30,minimumTermMonths:12,sortOrder:2,benefitsDetailed:[{key:'priority',text:'Synthetic 12-month commitment'}]},
];
try {
  for (const route of ['/widget/membership','/membership']) {
    for (const width of [1280,375,320]) {
      const page=await browser.newPage({viewport:{width,height:900}});
      const calls=[];
      let loginAttempts=0;
      await page.route('**/api/**',async r=>{
        const u=new URL(r.request().url()), path=u.pathname, method=r.request().method();
        calls.push({path,method});
        let body={};
        if(path==='/api/membership/plans') body=plans;
        else if(path==='/api/customers/login') {
          loginAttempts++;
          body=loginAttempts===1?{message:'Synthetic incorrect password'}:{token:'synthetic-token',customer:{email:'synthetic@example.invalid',emailVerified:true}};
        }
        else if(path==='/api/membership/my-subscription') body={subscription:null};
        else if(path==='/api/membership/billing') body={subscription:null,plans:[]};
        else if(path==='/api/membership/join') body={status:'pending',checkoutUrl:'https://payments.example.invalid/synthetic-checkout'};
        else if(path==='/api/customers/logout') body={success:true};
        else if(path==='/api/customers/me') body={customer:{email:'synthetic@example.invalid',emailVerified:true}};
        else body={};
        await r.fulfill({status:path==='/api/customers/login'&&loginAttempts===1?401:200,contentType:'application/json',body:JSON.stringify(body)});
      });
      await page.goto(origin+route);
      await page.locator('article[aria-label="Synthetic Flexible membership"]').waitFor();
      assert.match(await page.locator('.plan-card').first().innerText(),/every 30 days/);
      assert.match(await page.locator('.plan-card').nth(1).innerText(),/12-month minimum term/);
      await page.locator('#freqAnnual').click();
      assert.equal(await page.locator('#freqAnnual').getAttribute('aria-pressed'),'true');
      assert.match(await page.locator('.plan-card').nth(1).innerText(),/Billed annually/);
      const dimensions=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth}));
      assert(dimensions.scrollWidth<=dimensions.width,`${route} horizontal overflow at ${width}px: ${JSON.stringify(dimensions)}`);
      await page.screenshot({path:`${out}/membership-${route.slice(1).replace('/','-')}-${width}.png`});
      if(route==='/widget/membership'&&width===1280) {
        const opener=page.locator('button.plan-cta').nth(1);
        await opener.click();
        await page.waitForFunction(()=>document.activeElement?.id==='rFirst');
        assert.equal(await page.evaluate(()=>document.activeElement.id),'rFirst');
        await page.locator('#tabReg').focus();
        await page.keyboard.press('Shift+Tab');
        assert.equal(await page.evaluate(()=>document.activeElement.className),'cancel-btn');
        await page.keyboard.press('Escape');
        assert.match(await page.evaluate(()=>document.activeElement.textContent.trim()),/Join Synthetic Platinum for £200\.00\/yr/i);
        await opener.click();
        await page.locator('#tabLogin').click();
        await page.locator('#lEmail').fill('synthetic@example.invalid');
        await page.locator('#lPass').fill('synthetic-password');
        await page.locator('#joinTerms').check();
        await page.locator('#loginBtn').click();
        await page.getByText('Synthetic incorrect password',{exact:true}).waitFor();
        assert.equal(await page.locator('#loginBtn').isDisabled(),false,'failed login must allow retry');
        await page.keyboard.press('Escape');
        await opener.click();
        await page.locator('#tabLogin').click();
        assert.equal(await page.locator('#loginBtn').isDisabled(),false,'reopening must restore sign-in');
        await page.locator('#joinTerms').check();
        await page.locator('#loginBtn').click();
        await page.getByText(/Payment pending\. Continue to Square to pay securely/i).waitFor();
        assert.match(await page.locator('#successPane .success-sub').innerText(),/not active until Square confirms payment; nothing has been charged yet/i);
        assert.equal(await page.locator('#manualPayBtn').getAttribute('href'),'https://payments.example.invalid/synthetic-checkout');
        assert.equal(await page.locator('#manualPayHint a').getAttribute('href'),'https://payments.example.invalid/synthetic-checkout');
        assert.equal(page.url(),origin+route,'checkout must not open automatically');
        assert(calls.some(c=>c.path==='/api/membership/join'&&c.method==='POST'));
        assert(calls.some(c=>c.path==='/api/customers/login'&&c.method==='POST'));
        await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
        assert.equal(calls.filter(c=>c.path==='/api/customers/logout').length,0);
        await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));
        assert.equal(calls.filter(c=>c.path==='/api/customers/logout').length,1);
        assert.equal(await page.locator('#joinModal').evaluate(e=>e.classList.contains('open')),false);
        await page.screenshot({path:`${out}/membership-payment-pending-1280.png`});
      }
      await page.close();
    }
  }
  // Consent belongs to the plan/dialog that initiated login, even across slow responses.
  {
    const page=await browser.newPage();
    let releaseLogin, loginStarted, joins=0, logouts=0;
    const waiting=new Promise(resolve=>loginStarted=resolve);
    const gate=new Promise(resolve=>releaseLogin=resolve);
    await page.route('**/api/**',async r=>{
      const path=new URL(r.request().url()).pathname;
      if(path.endsWith('/login')) { loginStarted(); await gate; }
      if(path.endsWith('/join')) joins++;
      if(path.endsWith('/logout')) logouts++;
      const body=path.endsWith('/plans')?plans:path.endsWith('/login')?{token:'obsolete-plan-session',customer:{emailVerified:true}}:
        path.endsWith('/billing')?{subscription:null,plans:[]}:{};
      await r.fulfill({contentType:'application/json',body:JSON.stringify(body)});
    });
    await page.goto(origin+'/widget/membership');
    await page.locator('.plan-cta').first().click();
    await page.locator('#tabLogin').click();
    await page.locator('#lEmail').fill('synthetic@example.invalid');
    await page.locator('#lPass').fill('synthetic-password');
    await page.locator('#joinTerms').check();
    await page.locator('#loginBtn').click();
    await waiting;
    await page.keyboard.press('Escape');
    await page.locator('.plan-cta').nth(1).click();
    assert.equal(await page.locator('#joinTerms').isChecked(),false);
    releaseLogin();
    await page.waitForFunction(()=>false,{},{timeout:300}).catch(()=>{});
    assert.equal(joins,0,'late login for plan A must not purchase plan B');
    assert.equal(logouts,1,'obsolete login token must be revoked');
    assert(await page.locator('#formPane').isVisible());
    assert.match(await page.locator('#modalPlanPill').innerText(),/Synthetic Platinum/i);
    await page.close();
  }
  // A cross-origin sandbox without allow-popups reproduces a host that blocks checkout.
  for(const width of [375,1280]) {
    const context=await browser.newContext({viewport:{width,height:850}});
    // Fetch the actual route through Playwright's request client; Chromium's
    // cross-site development-proxy navigation can otherwise be rejected.
    await context.route(origin+'/widget/membership',async r=>{
      const response=await r.fetch();
      await r.fulfill({response});
    });
    await context.route('https://embed.example.invalid/**',r=>r.fulfill({contentType:'text/html',body:
      `<iframe title="membership" sandbox="allow-scripts allow-same-origin allow-forms" style="width:100%;height:800px;border:0" src="${origin}/widget/membership"></iframe>`}));
    await context.route('**/api/**',r=>{
      const path=new URL(r.request().url()).pathname;
      const body=path.endsWith('/plans')?plans:path.endsWith('/login')?{token:'synthetic',customer:{emailVerified:true}}:
        path.endsWith('/join')?{status:'pending',checkoutUrl:'https://payments.example.invalid/blocked'}:
        path.endsWith('/billing')?{subscription:null,plans:[]}:{};
      return r.fulfill({contentType:'application/json',body:JSON.stringify(body)});
    });
    const page=await context.newPage();
    await page.goto('https://embed.example.invalid/');
    const frame=await (await page.locator('iframe').elementHandle()).contentFrame();
    try { await frame.locator('.plan-cta').first().click({timeout:10000}); }
    catch(e) { console.log('Iframe diagnostic:',frame.url(),await frame.locator('body').innerText()); throw e; }
    await frame.locator('#tabLogin').click();
    await frame.locator('#lEmail').fill('synthetic@example.invalid');
    await frame.locator('#lPass').fill('synthetic-password');
    await frame.locator('#joinTerms').check();
    await frame.locator('#loginBtn').click();
    await frame.locator('#manualPayBtn').waitFor({state:'visible'});
    assert.equal(context.pages().length,1);
    await frame.locator('#manualPayBtn').click();
    await page.waitForTimeout(200);
    assert.equal(context.pages().length,1,'sandbox must prevent popup');
    assert.equal(await frame.locator('#manualPayHint a').getAttribute('href'),'https://payments.example.invalid/blocked');
    assert(await frame.locator('#manualPayHint').isVisible(),'copyable fallback remains after blocked popup');
    assert.match(await frame.locator('.success-sub').innerText(),/Payment pending/);
    assert(await frame.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.screenshot({path:`${out}/membership-blocked-popup-iframe-${width}.png`});
    await context.close();
  }
  console.log('Membership: synthetic plans, responsive layout, focus, pending state, session departure and sandbox-blocked popup fallback passed.');
} finally { await browser.close(); }
