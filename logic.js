// ==========================================================================
// HOST THIS FILE AT A URL — do NOT put it in the extension folder.
// Point SCRIPT_URL in background.js at wherever this lives, then edit it here.
// The loader injects it on your target pages and provides `ROWS` from your
// Google Sheet (or an empty array if you set SHEET_ID = "").
// Put any functions / logic you want here; change them anytime at the URL.
// ==========================================================================
(function () {
  function toSelector(s) { return /[#.\[\]>: ]/.test(s) ? s : "#" + s; }
  function hostOk(h) { if (!h) return true; const x = location.hostname; return x === h || x.endsWith("." + h); }

  function findEl(rec) {
    const sel = toSelector(rec.sel);
    if (rec.scope) {
      const sc = document.querySelector(toSelector(rec.scope));
      return sc ? sc.querySelector(sel) : null;
    }
    return document.querySelector(sel);
  }

  function setNumber(el, num) {
    const t = el.querySelector("strong") || el;
    const next = t.textContent.replace(/[\d.,]+/, num); // swap only the number, keep the prefix
    if (t.textContent !== next) t.textContent = next;
  }

  function apply() {
    const rows = (typeof ROWS !== "undefined") ? ROWS : [];
    for (const rec of rows) {
      if (!hostOk(rec.host)) continue;
      const el = findEl(rec);
      if (el) setNumber(el, rec.value);
    }
  }

  // Re-apply through the page's re-renders.
  new MutationObserver(apply).observe(document, { childList: true, subtree: true, characterData: true });
  apply();
})();
