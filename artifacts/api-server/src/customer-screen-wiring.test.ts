import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";

const html = fs.readFileSync(new URL("./templates/staff-dashboard.html", import.meta.url), "utf8");
test("customer module shares portal scope and initializes before boot", () => {
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
  const script = scripts.find(m => m[1].includes("function navigateTo"));
  assert.ok(script);
  new vm.Script(script[1]);
  assert.ok(script[1].includes("window.caInitPage=function"), "customer helpers must remain inside portal script");
  assert.ok(script[1].indexOf("window.caInitPage=function") < script[1].lastIndexOf("if(getToken()){bootApp()}"));
});
test("customer search input issues authenticated helper request and renders account results", async () => {
  const marker = html.indexOf("/* ── Customer accounts (all approved staff)");
  const start = html.indexOf("(function(){", marker);
  const end = html.indexOf("  /* Initialise after the account module", start);
  const listeners: Record<string, (event?: unknown) => void> = {};
  const elements = new Map<string, any>();
  const el = (id: string) => {
    if (!elements.has(id)) elements.set(id, { innerHTML: "", value: "", addEventListener: (name: string, fn: any) => { listeners[name] = fn; }, querySelectorAll: () => [] });
    return elements.get(id);
  };
  const calls: string[] = [];
  const sandbox: any = { window: {}, el, setTimeout: (fn: () => void) => { fn(); return 1; }, clearTimeout: () => {},
    esc: (s: any) => String(s ?? ""), api: async (url: string) => {
      calls.push(url);
      return { ok: true, json: async () => [{ id: 123, name: "Fixture Customer", email: "fixture@example.invalid" }] };
    } };
  vm.runInNewContext(html.slice(start, end), sandbox);
  sandbox.window.caInitPage();
  el("caSearchInput").value = "Fixture";
  listeners.input();
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.deepEqual(calls, ["/api/staff/customers/search?q=Fixture"]);
  assert.match(el("caSearchResults").innerHTML, /Fixture Customer/);
  el("caAccount").innerHTML = "previous customer details";
  sandbox.window.caResetSession();
  assert.equal(el("caSearchInput").value, "");
  assert.equal(el("caSearchResults").innerHTML, "");
  assert.doesNotMatch(el("caAccount").innerHTML, /previous customer details/);
  assert.match(el("caAccount").innerHTML, /No account open/);
});
