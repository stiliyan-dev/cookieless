/*
  What this file does:
  Defines the shared public config for Cookieless across the popup and service worker.

  Why it exists:
  The extension needs one source of truth for public URLs and the Supabase report endpoint.

  How to extend it:
  Keep secrets out of this file. Only place public URLs, the publishable key, and user-facing config here.
*/

(function defineCookielessConfig() {
  const config = Object.freeze({
    support: Object.freeze({
      repositoryUrl: "https://github.com/stiliyan-dev/cookieless",
      issuesUrl: "https://github.com/stiliyan-dev/cookieless/issues",
      homepageUrl: "https://stiliyan-dev.github.io/cookieless/",
      privacyPolicyUrl: "https://stiliyan-dev.github.io/cookieless/privacy-policy.html"
    }),
    reportSubmission: Object.freeze({
      projectRef: "nwehygsvuxwhqqxefhpr",
      functionName: "report-bug",
      endpoint: "https://nwehygsvuxwhqqxefhpr.supabase.co/functions/v1/report-bug",
      publicKey: "sb_publishable_kE6PUyfjF-Zh15zE-wqgNg_tLhm_dFy",
      disclosureText:
        "When you report a broken site, Cookieless sends the current page URL and diagnostic details to support so the issue can be reviewed and fixed."
    })
  });

  globalThis.CookielessConfig = config;
  globalThis.CookielessSupport = config.support;
})();
