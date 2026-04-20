/* The 147 Bradford — test site
   Modal launcher that embeds the real booking / membership / order
   systems via iframe so the test site stays in lockstep with production. */
(function () {
  "use strict";

  var URLS = {
    booking: "/widget/booking",
    membership: "/membership",
    order: "/order"
  };
  var TITLES = {
    booking: "Book a Table",
    membership: "Become a Member",
    order: "Order Food & Drink"
  };

  // Build modal scaffold once
  var modal = document.createElement("div");
  modal.className = "ts-modal";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.innerHTML =
    '<div class="ts-modal-backdrop" data-close="1"></div>' +
    '<div class="ts-modal-panel">' +
      '<header class="ts-modal-head">' +
        '<div class="ts-modal-title"></div>' +
        '<button type="button" class="ts-modal-close" aria-label="Close" data-close="1">' +
          '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
        '</button>' +
      '</header>' +
      '<div class="ts-modal-body">' +
        '<div class="ts-modal-loading"><div class="ts-spinner"></div><span>Loading</span></div>' +
        '<iframe class="ts-modal-iframe" allow="payment; clipboard-write; clipboard-read" referrerpolicy="no-referrer-when-downgrade" loading="lazy" title="Embedded feature"></iframe>' +
      '</div>' +
    '</div>';
  document.body.appendChild(modal);

  var titleEl = modal.querySelector(".ts-modal-title");
  var iframe = modal.querySelector(".ts-modal-iframe");
  var loading = modal.querySelector(".ts-modal-loading");

  function open(kind) {
    var url = URLS[kind];
    if (!url) return;
    titleEl.textContent = TITLES[kind] || "";
    iframe.classList.remove("ready");
    loading.classList.remove("hidden");
    iframe.src = url;
    document.documentElement.style.overflow = "hidden";
    modal.classList.add("open");
    // Update URL hash so refresh re-opens the same modal (nice-to-have)
    try { history.replaceState(null, "", "#" + kind); } catch (e) {}
  }

  function close() {
    modal.classList.remove("open");
    document.documentElement.style.overflow = "";
    setTimeout(function () { iframe.src = "about:blank"; }, 250);
    try { history.replaceState(null, "", window.location.pathname + window.location.search); } catch (e) {}
  }

  iframe.addEventListener("load", function () {
    if (iframe.src && iframe.src.indexOf("about:blank") === -1) {
      iframe.classList.add("ready");
      loading.classList.add("hidden");
    }
  });

  document.addEventListener("click", function (e) {
    var trigger = e.target.closest && e.target.closest("[data-modal]");
    if (trigger) {
      // Allow modifier-clicks / middle-click to follow href in a new tab
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button === 1) return;
      e.preventDefault();
      open(trigger.dataset.modal);
      return;
    }
    if (e.target.closest && e.target.closest("[data-close]")) {
      close();
    }
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && modal.classList.contains("open")) close();
  });

  // Auto-open if landed with #booking / #membership / #order
  var initial = (window.location.hash || "").replace("#", "");
  if (URLS[initial]) {
    setTimeout(function () { open(initial); }, 50);
  }
})();
