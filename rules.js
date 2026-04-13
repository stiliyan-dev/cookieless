/*
  What this file does:
  Defines CMP adapters, early-hide selectors, DNR wiring, and scored consent heuristics for Cookieless.

  Why it exists:
  The content script needs a local rule pack that is explicit, inspectable, and easy to tune.

  How to extend it:
  Add more adapters or tune the scoring thresholds as live-site coverage improves.
*/

const CookielessRules = (() => {
  const cmpAdapters = [
    createAdapter("onetrust", ["#onetrust-banner-sdk", "#onetrust-consent-sdk", "#onetrust-pc-sdk", ".ot-sdk-container"], ["#onetrust-reject-all-handler", "button[aria-label*='reject' i]", "button[id*='reject' i]"], ["#onetrust-pc-btn-handler"], ["#onetrust-reject-all-handler", ".save-preference-btn-handler"], ["ot-sdk-cookie-policy", "ot-sdk-show-settings"], [".onetrust-pc-dark-filter"], 0.98),
    createAdapter("cookiebot", ["#CybotCookiebotDialog", ".CybotCookiebotDialog", "#CybotCookiebotDialogBody"], ["#CybotCookiebotDialogBodyButtonDecline", "#CybotCookiebotDialogBodyLevelButtonLevelOptinDeclineAll"], ["#CybotCookiebotDialogBodyLevelButtonCustomize"], ["#CybotCookiebotDialogBodyLevelButtonLevelOptinDeclineAll"], ["CybotCookiebotDialogBodyOverflowHidden"], [], 0.97),
    createAdapter("trustarc", ["#trustarc-banner-wrapper", "#truste-consent-track", "#trustarcNoticeFrame", "[id*='trustarc' i]"], ["button[id*='reject' i]", "button[title*='reject' i]", "a[id*='reject' i]"], ["button[id*='preferences' i]", "button[id*='setting' i]"], ["button[id*='reject' i]"], ["truste_show_overlay"], [".truste_overlay"], 0.9),
    createAdapter("usercentrics", ["#usercentrics-root", "[data-testid='uc-default-banner']", "[data-testid='uc-banner-content']", ".uc-banner-content"], ["[data-testid='uc-deny-all-button']", "button[aria-label*='deny' i]"], ["[data-testid='uc-more-information-button']"], ["[data-testid='uc-deny-all-button']"], ["uc-no-scroll"], [], 0.97),
    createAdapter("didomi", ["#didomi-host", "#didomi-popup", "#didomi-notice", ".didomi-popup-container"], ["#didomi-notice-disagree-button", "#didomi-popup-disagree-button", "button[id*='disagree' i]"], ["#didomi-notice-learn-more-button"], ["#didomi-popup-disagree-button"], ["didomi-popup-open", "didomi-notice-open"], [".didomi-backdrop"], 0.96),
    createAdapter("sourcepoint", ["[id^='sp_message_container']", "[id*='sp_message_container']", ".sp_choice_type_11", ".sp_choice_type_12"], ["button[title*='reject' i]", "button[aria-label*='reject' i]", "[data-testid='reject-all']"], ["button[title*='manage' i]", "button[aria-label*='manage' i]"], ["button[title*='reject' i]", "[data-testid='reject-all']"], ["sp-message-open"], ["[class*='sp_message_container']"], 0.9),
    createAdapter("quantcast_choice", ["#qc-cmp2-container", ".qc-cmp2-container"], ["button[mode='secondary']", "button[aria-label*='reject' i]", "button[aria-label*='deny' i]"], ["button[mode='primary']"], ["button[mode='secondary']"], ["qc-cmp2-container"], [".qc-cmp2-main"], 0.92),
    createAdapter("cookieyes", ["#cookie-law-info-bar", ".cky-consent-container", ".cky-banner-container"], [".cky-btn-reject", ".cky-btn-customize", "button[aria-label*='reject' i]"], [".cky-btn-customize"], [".cky-btn-reject", ".cky-btn-customize"], ["cky-modal-open"], [".cky-overlay"], 0.9),
    createAdapter("osano", [".osano-cm-dialog", ".osano-cm-window", "#osano-cm-dom-info-dialog-open"], [".osano-cm-denyAll", "button[aria-label*='deny' i]"], [".osano-cm-manage"], [".osano-cm-denyAll"], ["osano-cm-open"], [".osano-cm-overlay"], 0.9),
    createAdapter("termly", [".termly-styles-root", "#termly-code-snippet-support"], [".t-decline-button", "button[aria-label*='decline' i]", "button[aria-label*='reject' i]"], [".t-customize-button"], [".t-decline-button"], ["termly-open"], [".termly-overlay"], 0.9),
    createAdapter("complianz", [".cmplz-cookiebanner", ".cmplz-banner", "#cmplz-cookiebanner-container"], [".cmplz-btn-deny", ".cmplz-btn-reject"], [".cmplz-manage-options"], [".cmplz-btn-deny", ".cmplz-btn-reject"], ["cmplz-open"], [".cmplz-overlay"], 0.88),
    createAdapter("axeptio", ["#axeptio_overlay", "#axeptio_btn_acceptAll", ".axeptio_mount"], ["button[data-testid='axeptio_btn_denyAll']", "button[aria-label*='deny' i]"], ["button[data-testid='axeptio_btn_preferences']"], ["button[data-testid='axeptio_btn_denyAll']"], ["axeptio-open"], ["#axeptio_overlay"], 0.88),
    createAdapter("cookie_information", [".coi-banner", ".cookie-information-banner", "#coi-banner-wrapper"], [".coi-banner__reject", "button[aria-label*='reject' i]"], [".coi-banner__settings"], [".coi-banner__reject"], ["coi-open"], [".coi-overlay"], 0.88),
    createAdapter("crownpeak_evidon", ["#_evidon_banner", ".evidon-banner", "#evidon-prefdiag"], ["button[id*='decline' i]", "button[id*='reject' i]"], ["button[id*='preferences' i]"], ["button[id*='decline' i]", "button[id*='reject' i]"], ["evidon-open"], [".evidon-background"], 0.86),
    createAdapter("fides", ["#fides-banner", "#fides-modal", "#fides-embed-container"], ["button[id*='reject' i]", "button[aria-label*='reject' i]", "[data-testid*='reject' i]"], ["button[id*='manage' i]", "button[aria-label*='manage' i]", "[data-testid*='manage' i]"], ["button[id*='save' i]", "button[aria-label*='save' i]"], ["fides-banner-open", "fides-modal-open"], ["#fides-overlay", "[class*='fides-overlay' i]"], 0.95, ["*.nytimes.com"])
  ];

  const earlyGenericSelectors = [
    "[id*='cookie-banner' i]",
    "[id*='cookie-consent' i]",
    "[id*='cookie-modal' i]",
    "[id*='cookiebanner' i]",
    "[class*='cookie-banner' i]",
    "[class*='cookie-consent' i]",
    "[class*='cookie-modal' i]",
    "[data-testid*='cookie' i]",
    "[data-cookiebanner]",
    "[aria-label*='cookie' i]"
  ];

  const genericContainerSelectors = [
    "[id*='cookie' i]",
    "[id*='cookie-banner' i]",
    "[id*='cookie-consent' i]",
    "[class*='cookie-banner' i]",
    "[class*='cookie-consent' i]",
    "[class*='cookie-modal' i]",
    "[class*='consent-banner' i]",
    "[class*='consent-modal' i]",
    "[data-testid*='cookie' i]",
    "[data-testid*='consent' i]",
    "[data-cookiebanner]",
    "[data-consent-modal]",
    "[aria-label*='cookie' i]",
    "[aria-label*='consent' i]"
  ];

  const overlaySelectors = [
    ".onetrust-pc-dark-filter",
    ".didomi-backdrop",
    ".truste_overlay",
    ".cky-overlay",
    ".osano-cm-overlay",
    ".qc-cmp2-main",
    ".termly-overlay",
    ".cmplz-overlay",
    ".coi-overlay",
    ".evidon-background",
    "[id*='cookie-overlay' i]",
    "[id*='consent-overlay' i]",
    "[class*='cookie-overlay' i]",
    "[class*='consent-overlay' i]"
  ];

  const cookieTextSignals = [
    "cookie",
    "cookies",
    "cookie settings",
    "necessary cookies",
    "optional cookies",
    "use of cookies",
    "this site uses cookies",
    "browser cookies",
    "reject optional",
    "essential only",
    "store and/or access information on a device"
  ];

  const consentTextSignals = [
    "consent",
    "privacy",
    "tracking",
    "gdpr",
    "we value your privacy",
    "your privacy choices",
    "privacy choices",
    "necessary cookies",
    "personal data",
    "partners",
    "analytics",
    "advertising",
    "preference center",
    "manage your privacy",
    "legitimate interest",
    "vendors",
    "use of cookies",
    "cookie settings",
    "do not sell"
  ];

  const rejectTextSignals = [
    "reject",
    "reject all",
    "decline",
    "deny",
    "disagree",
    "refuse",
    "opt out",
    "do not consent",
    "do not agree",
    "do not allow",
    "continue without accepting",
    "continue without agreeing",
    "necessary only",
    "essential only",
    "reject optional",
    "use necessary only"
  ];

  const acceptTextSignals = [
    "accept",
    "allow all",
    "allow cookies",
    "accept all cookies",
    "agree",
    "consent",
    "enable all",
    "ok, got it"
  ];

  const settingsTextSignals = [
    "manage",
    "settings",
    "preferences",
    "customize",
    "options",
    "learn more"
  ];

  const hardBlockSignals = [
    "just a moment",
    "checking your browser",
    "enable javascript and cookies to continue",
    "verify you are human",
    "human verification",
    "cloudflare challenge"
  ];

  const negativeSignals = [
    "newsletter",
    "sign up",
    "sign in",
    "log in",
    "login",
    "register",
    "subscribe",
    "join now",
    "checkout",
    "payment",
    "billing",
    "paywall",
    "promo",
    "sale ends",
    "email address",
    "play now",
    "start game",
    "play game",
    "finding match",
    "find match",
    "matchmaking",
    "queue",
    "opponent",
    "join table",
    "seat at table",
    "waiting for players"
  ];

  const genericBypassHosts = [
    "belot.bg",
    "*.belot.bg"
  ];

  const knownConsentFrameHosts = [
    "consent.yahoo.com",
    "privacy-mgmt.com",
    "*.privacy-mgmt.com",
    "*.consensu.org",
    "*.cookielaw.org",
    "*.onetrust.com"
  ];

  const lockClasses = [
    "modal-open",
    "no-scroll",
    "sp-message-open",
    "didomi-popup-open",
    "didomi-notice-open",
    "uc-no-scroll",
    "CybotCookiebotDialogBodyOverflowHidden",
    "truste_show_overlay",
    "cky-modal-open",
    "osano-cm-open",
    "termly-open",
    "cmplz-open",
    "coi-open",
    "evidon-open",
    "qc-cmp2-ui-open"
  ];

  const earlyHideSelectors = [
    ...new Set(
      cmpAdapters.flatMap((adapter) => adapter.selectors.containers).concat(earlyGenericSelectors)
    )
  ];

  function createAdapter(id, containers, rejectButtons, configureButtons, secondaryRejectButtons, rootClasses, extraSelectors, confidence, hostPatterns) {
    return {
      id,
      hostPatterns: Array.isArray(hostPatterns) && hostPatterns.length ? hostPatterns : ["*"],
      selectors: {
        containers,
        rejectButtons,
        configureButtons,
        secondaryRejectButtons
      },
      action: "reject_or_hide",
      steps: ["detect-container", "attempt-safe-reject", "fallback-hide"],
      cleanup: {
        unlock: true,
        rootClasses,
        extraSelectors
      },
      confidence,
      notes: "Curated local CMP adapter."
    };
  }

  function normalizeText(value) {
    return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
  }

  function matchesHostPatterns(hostname, hostPatterns) {
    const normalizedHost = normalizeText(hostname);
    return (hostPatterns || ["*"]).some((pattern) => {
      const normalizedPattern = normalizeText(pattern);
      if (normalizedPattern === "*") {
        return true;
      }

      if (normalizedPattern.startsWith("*.")) {
        const suffix = normalizedPattern.slice(2);
        return normalizedHost === suffix || normalizedHost.endsWith(`.${suffix}`);
      }

      return normalizedPattern === normalizedHost;
    });
  }

  function extractControlText(control) {
    return normalizeText(
      control?.getAttribute?.("aria-label") ||
      control?.getAttribute?.("title") ||
      control?.innerText ||
      control?.textContent ||
      control?.getAttribute?.("value") ||
      ""
    );
  }

  function scoreConsentCandidate(element) {
    if (!(element instanceof HTMLElement)) {
      return { accepted: false, confidence: 0, score: 0, reasons: [] };
    }

    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    const text = normalizeText(element.innerText || element.textContent || "");
    const meta = normalizeText(`${element.id} ${element.className} ${element.getAttribute("aria-label") || ""}`);
    const controls = Array.from(
      element.querySelectorAll("button, [role='button'], a[href], input[type='button'], input[type='submit']")
    );

    let score = 0;
    const reasons = [];

    if (hardBlockSignals.some((signal) => text.includes(signal) || meta.includes(signal))) {
      return {
        accepted: false,
        confidence: 0,
        score: 0,
        reasons: ["hard-block-signal"],
        rejectCount: 0,
        acceptCount: 0,
        settingsCount: 0
      };
    }

    const hasCookieSignal = cookieTextSignals.some((signal) => text.includes(signal) || meta.includes(signal));
    const hasConsentCopy = consentTextSignals.some((signal) => text.includes(signal) || meta.includes(signal));
    if (hasCookieSignal) {
      score += 4;
      reasons.push("cookie-copy");
    }

    if (hasConsentCopy) {
      score += hasCookieSignal ? 1 : 0;
      reasons.push("consent-copy");
    }

    if (meta.includes("cmp") || meta.includes("tcf")) {
      score += 1;
      reasons.push("cmp-meta");
    }

    if (rect.width >= 240 && rect.height >= 80) {
      score += 1;
      reasons.push("large-surface");
    }

    const coversPageSurface =
      rect.width >= Math.max(240, window.innerWidth * 0.45) &&
      rect.height >= Math.max(96, window.innerHeight * 0.22);
    const isOverlayLike =
      style.position === "fixed" ||
      style.position === "sticky" ||
      element.getAttribute("role") === "dialog" ||
      element.tagName === "DIALOG" ||
      coversPageSurface;

    if (isOverlayLike) {
      score += 2;
      reasons.push(coversPageSurface ? "page-surface" : "overlay-behavior");
    }

    if (window !== window.top) {
      score += 1;
      reasons.push("iframe-context");
    }

    if (document.documentElement.className.match(/modal|scroll|consent|privacy/i) || document.body.className.match(/modal|scroll|consent|privacy/i)) {
      score += 1;
      reasons.push("scroll-lock");
    }

    const rejectCount = controls.filter((control) => isRejectText(extractControlText(control))).length;
    const acceptCount = controls.filter((control) => isAcceptText(extractControlText(control))).length;
    const settingsCount = controls.filter((control) => settingsTextSignals.some((signal) => extractControlText(control).includes(signal))).length;

    if (rejectCount) {
      score += 2;
      reasons.push("reject-control");
    }

    if (acceptCount) {
      score += 1;
      reasons.push("accept-control");
    }

    if (rejectCount && acceptCount) {
      score += 1;
      reasons.push("action-pair");
    }

    if (settingsCount) {
      score += 1;
      reasons.push("settings-control");
    }

    if (acceptCount && !rejectCount && !settingsCount) {
      score -= 1;
      reasons.push("accept-only");
    }

    if (negativeSignals.some((signal) => text.includes(signal) || meta.includes(signal))) {
      score -= 4;
      reasons.push("negative-signal");
    }

    const accepted =
      score >= 6 &&
      hasCookieSignal &&
      isOverlayLike &&
      (rejectCount > 0 || settingsCount > 0) &&
      !(acceptCount > 0 && rejectCount === 0 && settingsCount === 0);
    const confidence = Math.max(0, Math.min(0.99, score / 8));

    return {
      accepted,
      confidence,
      score,
      reasons,
      rejectCount,
      acceptCount,
      settingsCount
    };
  }

  function findAdapterForElement(element) {
    if (!(element instanceof HTMLElement)) {
      return null;
    }

    return cmpAdapters.find((adapter) =>
      adapter.selectors.containers.some((selector) => {
        try {
          return element.matches(selector) || Boolean(element.closest(selector));
        } catch (error) {
          return false;
        }
      })
    ) || null;
  }

  function buildEarlyHideCss(mode) {
    const includeGenericSelectors = mode === "strict_reject";
    const selectors = includeGenericSelectors
      ? [...new Set([...earlyHideSelectors, ...overlaySelectors])]
      : [...new Set([...cmpAdapters.flatMap((adapter) => adapter.selectors.containers), ...overlaySelectors])];
    return `${selectors.join(",\n")} { opacity: 0 !important; visibility: hidden !important; pointer-events: none !important; }`;
  }

  function isRejectText(text) {
    const normalized = normalizeText(text);
    return rejectTextSignals.some((signal) => normalized.includes(signal));
  }

  function isAcceptText(text) {
    const normalized = normalizeText(text);
    if (!normalized || isRejectText(normalized)) {
      return false;
    }

    if (/(do not|don't|without)\s+(accept|agree|consent|allow)/.test(normalized)) {
      return false;
    }

    return acceptTextSignals.some((signal) => normalized.includes(signal));
  }

  return {
    dnrRulesetId: "consent_network",
    cmpAdapters,
    earlyGenericSelectors,
    earlyHideSelectors,
    overlaySelectors,
    genericContainerSelectors,
    consentTextSignals,
    cookieTextSignals,
    rejectTextSignals,
    acceptTextSignals,
    settingsTextSignals,
    hardBlockSignals,
    knownConsentFrameHosts,
    lockClasses,
    normalizeText,
    buildEarlyHideCss,
    getAdaptersForHost(hostname) {
      return cmpAdapters.filter((adapter) => matchesHostPatterns(hostname, adapter.hostPatterns));
    },
    isKnownConsentHost(hostname) {
      return matchesHostPatterns(hostname, knownConsentFrameHosts);
    },
    shouldBypassGenericHost(hostname) {
      return matchesHostPatterns(hostname, genericBypassHosts);
    },
    findAdapterForElement,
    scoreConsentCandidate,
    isRejectText,
    isAcceptText,
    extractControlText
  };
})();
