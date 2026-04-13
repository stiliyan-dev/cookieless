/*
  What this file does:
  Preserves the legacy support alias for popup and docs scripts.

  Why it exists:
  Older code paths still expect `CookielessSupport`, even though `config.js` is now the source of truth.

  How to extend it:
  Update `config.js` first, then keep this file as a thin compatibility layer only.
*/

window.CookielessSupport = globalThis.CookielessConfig?.support || globalThis.CookielessSupport || Object.freeze({});
