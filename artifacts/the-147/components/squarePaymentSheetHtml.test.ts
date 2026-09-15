import assert from "node:assert/strict";
import test from "node:test";
import { runInNewContext } from "node:vm";

import { buildCardFieldHtml } from "./squareCardFieldHtml.ts";
import { buildPaymentSheetHtml } from "./squarePaymentSheetHtml.ts";
import {
  GOOGLE_PAY_BUTTON_CLEAR_SPACE,
  GOOGLE_PAY_WEB_BUTTON_HEIGHT,
  getGooglePayWebButtonOptions,
} from "../lib/google-pay-branding.ts";
import {
  APPLE_PAY_BUTTON_CLEAR_SPACE,
  APPLE_PAY_BUTTON_HEIGHT,
  APPLE_PAY_BUTTON_MIN_WIDTH,
  getApplePayButtonOptions,
} from "../lib/apple-pay-branding.ts";

const baseOptions = {
  applicationId: "test-application",
  locationId: "test-location",
  environment: "sandbox" as const,
  amountPence: 1250,
  currency: "GBP",
};

test("renders the payment form with light appearance tokens", () => {
  const html = buildPaymentSheetHtml({ ...baseOptions, appearance: "light" });

  assert.match(html, /--background: #F4F7FB/);
  assert.match(html, /--surface: #FFFFFF/);
  assert.match(html, /--text: #102033/);
  assert.match(html, /background: var\(--background\)/);
});

test("renders dark tokens by default and when explicitly selected", () => {
  const defaultHtml = buildPaymentSheetHtml(baseOptions);
  const darkHtml = buildPaymentSheetHtml({ ...baseOptions, appearance: "dark" });

  for (const html of [defaultHtml, darkHtml]) {
    assert.match(html, /--background: #0A1628/);
    assert.match(html, /--surface: #13233A/);
    assert.match(html, /--text: #FFFFFF/);
  }
});

test("uses Square's official Google Pay button with light treatment on dark sheets", () => {
  const darkHtml = buildPaymentSheetHtml({ ...baseOptions, appearance: "dark" });
  const lightHtml = buildPaymentSheetHtml({ ...baseOptions, appearance: "light" });

  assert.deepEqual(getGooglePayWebButtonOptions("dark"), {
    buttonColor: "white",
    buttonSizeMode: "fill",
    buttonType: "long",
    buttonRadius: 12,
    buttonBorderType: "default_border",
  });
  assert.match(darkHtml, /gp\.attach\("#google-pay-button", \{"buttonColor":"white"/);
  assert.match(darkHtml, new RegExp(`padding: ${GOOGLE_PAY_BUTTON_CLEAR_SPACE}px 16px`));
  assert.match(darkHtml, new RegExp(`height: ${GOOGLE_PAY_WEB_BUTTON_HEIGHT}px`));
  assert.doesNotMatch(darkHtml, /background:#000/);
  assert.doesNotMatch(darkHtml, new RegExp(["Pay", "with", "Google", "Pay"].join("\\s+")));

  assert.match(lightHtml, /gp\.attach\("#google-pay-button", \{"buttonColor":"black"/);
});

test("uses Apple's official button with approved contrast and action labels", () => {
  const darkOrderHtml = buildPaymentSheetHtml({ ...baseOptions, appearance: "dark" });
  const lightMembershipHtml = buildPaymentSheetHtml({
    ...baseOptions,
    appearance: "light",
    intent: "STORE",
  });

  assert.deepEqual(getApplePayButtonOptions("dark", "CHARGE"), {
    buttonStyle: "white",
    type: "buy",
    locale: "en-GB",
  });
  assert.deepEqual(getApplePayButtonOptions("light", "STORE"), {
    buttonStyle: "black",
    type: "subscribe",
    locale: "en-GB",
  });

  assert.match(darkOrderHtml, /applepay\.cdn-apple\.com\/jsapi\/v1\.1\.0\/apple-pay-sdk\.js/);
  assert.match(darkOrderHtml, /setAttribute\("buttonstyle", "white"\)/);
  assert.match(darkOrderHtml, /setAttribute\("type", "buy"\)/);
  assert.match(lightMembershipHtml, /setAttribute\("buttonstyle", "black"\)/);
  assert.match(lightMembershipHtml, /setAttribute\("type", "subscribe"\)/);

  for (const html of [darkOrderHtml, lightMembershipHtml]) {
    assert.match(html, new RegExp(`padding: ${APPLE_PAY_BUTTON_CLEAR_SPACE}px 16px`));
    assert.match(html, new RegExp(`height: ${APPLE_PAY_BUTTON_HEIGHT}px`));
    assert.match(html, new RegExp(`min-width: ${APPLE_PAY_BUTTON_MIN_WIDTH}px`));
    assert.match(html, /createElement\("apple-pay-button"\)/);
    assert.doesNotMatch(html, /innerHTML\s*=\s*['"`].*Apple Pay/);
    assert.doesNotMatch(html, /buttonstyle",\s*"white".*innerHTML/);
  }
});

test("wires one official Apple Pay button click to one tokenize call", async () => {
  for (const html of [
    buildPaymentSheetHtml({ ...baseOptions, appearance: "dark" }),
    buildCardFieldHtml(baseOptions),
  ]) {
    const buttonStart = html.indexOf('var btn = document.createElement("apple-pay-button")');
    const bridgeStart = html.lastIndexOf("try {", buttonStart);
    const buttonEnd = html.indexOf("}).catch(function (err)", buttonStart);
    assert.notEqual(buttonStart, -1);
    assert.notEqual(bridgeStart, -1);
    assert.notEqual(buttonEnd, -1);

    // Execute only the official-button bridge against mocks. This keeps the
    // regression focused on our click wiring instead of the browser SDK.
    const buttonBridge = html.slice(bridgeStart, buttonEnd);
    const clickHandlers: Array<() => void> = [];
    let tokenizeCalls = 0;
    const button = {
      style: { setProperty() {} },
      setAttribute() {},
      addEventListener(event: string, handler: () => void) {
        assert.equal(event, "click");
        clickHandlers.push(handler);
      },
    };
    const target = {
      innerHTML: "",
      style: { display: "", height: "", borderRadius: "", overflow: "" },
      removeAttribute() {},
      appendChild() {},
    };
    const context = {
      document: {
        createElement(tag: string) {
          assert.equal(tag, "apple-pay-button");
          return button;
        },
        getElementById(id: string) {
          if (id === "apple-pay-button") return target;
          assert.equal(id, "or-divider");
          return { style: { display: "" } };
        },
      },
      diag() {},
      tokenizeAndSend(paymentMethod: unknown, method: string) {
        assert.equal(method, "Apple Pay");
        assert.ok(paymentMethod);
        tokenizeCalls += 1;
      },
      send() {},
      scheduleReport() {},
      ap: {},
    };

    await runInNewContext(`(async () => { ${buttonBridge} })()`, context);
    assert.equal(clickHandlers.length, 1);
    clickHandlers[0]?.();
    assert.equal(tokenizeCalls, 1);
  }
});

test("wires one mocked Square attach click to one tokenize call", async () => {
  for (const html of [
    buildPaymentSheetHtml({ ...baseOptions, appearance: "dark" }),
    buildCardFieldHtml(baseOptions),
  ]) {
    const attachStart = html.indexOf('gp.attach("#google-pay-button"');
    const attachEnd = html.indexOf("}).catch(function (err)", attachStart);
    assert.notEqual(attachStart, -1);
    assert.notEqual(attachEnd, -1);

    // Execute only the documented attach().then(...onclick...) bridge against
    // mocks. This proves attach renders the button and our single onclick
    // assignment is the only path that calls googlePay.tokenize().
    const attachBridge = `${html.slice(attachStart, attachEnd)}});`;
    const target: {
      onclick: (() => void) | null;
      addEventListenerCalls: number;
      addEventListener: () => void;
    } = {
      onclick: null,
      addEventListenerCalls: 0,
      addEventListener() {
        this.addEventListenerCalls += 1;
      },
    };
    const attachCalls: Array<{ selector: string; options: Record<string, unknown> }> = [];
    let tokenizeCalls = 0;
    const context = {
      gp: {
        attach(selector: string, options: Record<string, unknown>) {
          attachCalls.push({ selector, options });
          return Promise.resolve();
        },
      },
      document: {
        getElementById(id: string) {
          if (id === "google-pay-button") return target;
          assert.equal(id, "or-divider");
          return { style: {} };
        },
      },
      diag() {},
      tokenizeAndSend() {
        tokenizeCalls += 1;
      },
      send() {},
      scheduleReport() {},
    };

    await runInNewContext(`(async () => { ${attachBridge} })()`, context);
    assert.equal(attachCalls.length, 1);
    assert.equal(attachCalls[0]?.selector, "#google-pay-button");
    assert.equal(attachCalls[0]?.options.buttonColor, "white");
    assert.equal(target.addEventListenerCalls, 0);
    assert.equal(typeof target.onclick, "function");
    target.onclick?.();
    assert.equal(tokenizeCalls, 1);
  }
});