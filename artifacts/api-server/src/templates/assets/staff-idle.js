/* Staff website only. No timer, polling request or tab focus renews the session. */
(function () {
  'use strict';
  window.installStaffIdle = function (options) {
    const key = 'staffIdle147';
    const nativeFetch = window.fetch.bind(window);
    let token = null, deadline = 0, stopped = false, pending = null, inFlight = false;
    let lastSent = 0, lastHuman = 0, warning = null, warningText = null;
    let aborter = new AbortController();

    function readShared() {
      try {
        const data = JSON.parse(localStorage.getItem(key) || 'null');
        if (data && data.token === token && Number.isFinite(data.deadline)) deadline = Math.max(deadline, data.deadline);
      } catch (_) { /* A missing deadline fails closed below. */ }
    }
    function hideWarning() {
      if (warning && warning.open) warning.close();
    }
    function end(reason, revoke) {
      if (stopped) return;
      stopped = true;
      const oldToken = token;
      aborter.abort();
      clearTimeout(pending);
      if (options.getToken() === oldToken) {
        options.clearToken();
        localStorage.removeItem(key);
      }
      // Remove confidential content immediately, before waiting for any network.
      document.body.replaceChildren();
      const message = document.createElement('p');
      message.textContent = reason === 'idle' ? 'Signed out after 15 minutes of inactivity. Please sign in again.' : 'Signed out. Returning to sign in…';
      document.body.appendChild(message);
      document.documentElement.style.visibility = 'visible';
      if (oldToken && revoke !== false) {
        nativeFetch('/api/staff/logout', { method: 'POST', headers: { Authorization: 'Bearer ' + oldToken }, keepalive: true }).catch(function () {});
      }
      window.location.replace(window.location.pathname + '?signedOut=' + (reason === 'idle' ? 'idle' : 'session'));
    }
    function valid() {
      if (stopped) return false;
      if (!token) return true;
      if (options.getToken() !== token) { end('session', false); return false; }
      readShared();
      if (!deadline || Date.now() >= deadline) { end('idle'); return false; }
      return true;
    }
    function accept(expires, serverNow, expectedToken) {
      if (stopped || !token || expectedToken !== token || options.getToken() !== token) return;
      const remaining = Date.parse(expires) - Date.parse(serverNow);
      if (!Number.isFinite(remaining)) return;
      // Use server remaining time to tolerate ordinary client clock skew.
      // Never accept more than the policy window, even from a stale response.
      const next = Date.now() + Math.min(15 * 60 * 1000, remaining);
      readShared();
      deadline = Math.max(deadline, next);
      localStorage.setItem(key, JSON.stringify({ token: token, deadline: deadline }));
      if (deadline - Date.now() > 60_000) hideWarning();
    }
    function start(expires, serverNow) {
      token = options.getToken();
      deadline = 0; stopped = false; lastSent = 0; lastHuman = 0;
      aborter = new AbortController();
      if (token) {
        readShared();
        if (expires && serverNow) accept(expires, serverNow, token);
        valid();
      }
    }
    async function renew() {
      pending = null;
      if (!token || !valid() || inFlight) return;
      const elapsedMs = Math.max(0, Date.now() - lastHuman);
      if (elapsedMs > 15_000) return; // no queued heartbeat while a device sleeps
      inFlight = true; lastSent = Date.now();
      try {
        const response = await window.fetch('/api/staff/activity', {
          method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
          body: JSON.stringify({ elapsedMs: elapsedMs }),
        });
        if (!response.ok && warningText) warningText.textContent = 'Unable to extend your session. Try Stay signed in again before the timeout.';
      } catch (_) {
        if (!stopped && warningText) warningText.textContent = 'Connection lost. Your session has not been extended. Try again before the timeout.';
      } finally { inFlight = false; }
    }
    function activity(event) {
      if (!event.isTrusted || document.visibilityState !== 'visible' || !token || !valid()) return;
      if (warning && warning.open) return; // warning requires explicit acknowledgement
      lastHuman = Date.now();
      if (Date.now() - lastSent >= 10_000) renew();
      else if (!pending) pending = setTimeout(renew, Math.max(1, 10_000 - (Date.now() - lastSent)));
    }
    function showWarning() {
      if (!warning) {
        warning = document.createElement('dialog');
        warning.setAttribute('aria-labelledby', 'staffIdleHeading');
        warning.style.cssText = 'max-width:420px;width:calc(100% - 48px);padding:24px;border:1px solid #cbd5e1;border-radius:16px;color:#102039;background:white;box-shadow:0 16px 64px #0005';
        warning.innerHTML = '<h2 id="staffIdleHeading">Still using the staff portal?</h2><p id="staffIdleMessage"></p><p>Unsaved changes, including stock counts, will be lost when you are signed out. Choose Stay signed in, then save your work.</p><div style="display:flex;gap:12px;flex-wrap:wrap"><button type="button" data-continue style="padding:12px">Stay signed in</button><button type="button" data-logout style="padding:12px">Sign out</button></div>';
        document.body.appendChild(warning);
        warningText = warning.querySelector('#staffIdleMessage');
        warning.addEventListener('cancel', function (event) { event.preventDefault(); });
        warning.querySelector('[data-continue]').addEventListener('click', function (event) {
          if (!event.isTrusted || !valid()) return;
          lastHuman = Date.now(); clearTimeout(pending); renew();
        });
        warning.querySelector('[data-logout]').addEventListener('click', function () { end('session'); });
      }
      warningText.textContent = 'For privacy, you will be signed out in ' + Math.max(0, Math.ceil((deadline - Date.now()) / 1000)) + ' seconds.';
      if (!warning.open) warning.showModal();
    }
    function check() {
      if (!token || !valid()) return;
      if (deadline - Date.now() <= 60_000 && document.visibilityState === 'visible') showWarning();
      else hideWarning();
    }

    // Covers shared API helper AND direct uploads/downloads. In-flight replies
    // from a signed-out session must never repopulate the confidential screen.
    window.fetch = async function (input, init) {
      const headers = new Headers(init && init.headers || (input instanceof Request ? input.headers : undefined));
      const auth = headers.get('Authorization');
      const url = new URL(input instanceof Request ? input.url : String(input), window.location.href);
      const protectedRequest = url.origin === window.location.origin && auth && auth.startsWith('Bearer ');
      const requestToken = protectedRequest ? auth.slice(7) : null;
      if (protectedRequest) {
        if (!valid() || requestToken !== token) throw new Error('Session expired');
        headers.set('X-Staff-Client', 'web');
        const signal = init && init.signal || (input instanceof Request ? input.signal : undefined);
        init = Object.assign({}, init, { headers: headers, signal: signal && AbortSignal.any ? AbortSignal.any([signal, aborter.signal]) : aborter.signal });
      }
      const response = await nativeFetch(input, init);
      if (protectedRequest) {
        if (!valid() || options.getToken() !== requestToken) throw new Error('Session expired');
        if (response.status === 401) { end('session'); throw new Error('Session expired'); }
        // Only the explicit activity response changes the local deadline.
        // Ordinary polling responses never keep an unattended screen unlocked.
        if (url.pathname === '/api/staff/activity' && response.ok) {
          accept(response.headers.get('X-Staff-Idle-Expires-At'), response.headers.get('X-Staff-Server-Time'), requestToken);
        }
        if (!valid()) throw new Error('Session expired');
      }
      return response;
    };
    ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'input'].forEach(function (name) {
      document.addEventListener(name, activity, { passive: true, capture: true });
    });
    window.addEventListener('storage', function (event) {
      if (event.key === key || event.key === 'staffToken147') check();
    });
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden' && token) document.documentElement.style.visibility = 'hidden';
      else { check(); document.documentElement.style.visibility = 'visible'; }
    });
    window.addEventListener('pagehide', function () { if (token) document.documentElement.style.visibility = 'hidden'; });
    window.addEventListener('pageshow', function () { check(); document.documentElement.style.visibility = 'visible'; });
    setInterval(check, 1000);
    start();
    return { start: start, signOut: function () { end('session'); } };
  };
})();
