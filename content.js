/*
  What this file does:
  Detects consent banners in the page, hides them, and auto-rejects only in high-confidence flows.

  Why it exists:
  Cookieless lives or dies on careful page-side behavior, reversible cleanup, and explicit outcome reporting.

  How to extend it:
  Add more CMP adapters or tune the generic scoring thresholds as live-site coverage improves.
*/

(function cookielessContent() {
  const EARLY_STYLE_ID = "cookieless-early-style";
  const SKIP_ONCE_KEY = "__cookielessSkipOnce";
  const CHALLENGE_TEXT_SIGNALS = [
    "just a moment",
    "checking your browser",
    "enable javascript and cookies to continue",
    "verify you are human",
    "human verification"
  ];

  const state = {
    hostname: getPageKey(),
    mode: "balanced",
    pageEnabled: true,
    debugEnabled: false,
    observer: null,
    scanTimer: null,
    earlyStyleTag: null,
    actionStack: [],
    detectedAdapters: new Set(),
    hiddenCount: 0,
    rejectedCount: 0,
    activityLog: [],
    processedElements: new WeakMap(),
    attemptCounts: new WeakMap(),
    initialized: false,
    currentOutcome: fallbackOutcome(),
    currentDetection: null
  };

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "cookieless-get-page-status") {
      sendResponse(buildPageStatus());
      return true;
    }

    if (message.type === "cookieless-undo-last-action") {
      undoLastAction().then(sendResponse);
      return true;
    }

    if (message.type === "cookieless-export-debug") {
      sendResponse({
        ok: true,
        reportText: buildDebugReport()
      });
      return true;
    }

    if (message.type === "cookieless-retry-consent-flow") {
      resetCandidateTracking();
      scheduleScan("manual-retry", 20, true);
      sendResponse({
        ok: true,
        message: "Cookieless is retrying the current page."
      });
      return true;
    }

    return false;
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") {
      return;
    }

    if (changes.mode || changes.siteOverrides || changes.debugEnabled) {
      loadStorageState().then(() => {
        scheduleScan("storage-change", 40, true);
      });
    }
  });

  patchHistory();
  initialize();

  async function initialize() {
    await loadStorageState();

    if (shouldSkipOnce()) {
      log("skip-once", "A recent undo asked Cookieless to stand down on this reload.");
      return;
    }

    if (!state.pageEnabled) {
      log("site-disabled", "Cookieless is disabled on this hostname.");
      return;
    }

    ensureEarlyHideStyle();
    ensureObserver();
    installPageListeners();
    state.initialized = true;
    scheduleScan("startup", 20, false);
    log("initialized", `${state.mode} mode on ${state.hostname || "unknown host"}.`);
  }

  async function loadStorageState() {
    const storedState = await CookielessStorage.getState();
    state.mode = storedState.mode;
    state.pageEnabled = CookielessStorage.isSiteEnabled(
      state.hostname,
      storedState.siteOverrides
    );
    state.debugEnabled = Boolean(storedState.debugEnabled);

    if (!state.pageEnabled) {
      removeEarlyHideStyle();
      disconnectObserver();
    } else {
      ensureEarlyHideStyle();
      ensureObserver();
    }
  }

  function installPageListeners() {
    window.addEventListener("load", () => scheduleScan("load", 10), true);
    window.addEventListener("pageshow", () => scheduleScan("pageshow", 10), true);
    window.addEventListener("popstate", () => scheduleScan("popstate", 80), true);
    document.addEventListener("readystatechange", () => {
      scheduleScan(`ready-${document.readyState}`, 20);
    });
    document.addEventListener("click", () => scheduleScan("user-click", 120), true);
  }

  function patchHistory() {
    ["pushState", "replaceState"].forEach((methodName) => {
      const original = history[methodName];

      if (typeof original !== "function") {
        return;
      }

      history[methodName] = function cookielessHistoryPatch() {
        const result = original.apply(this, arguments);
        window.dispatchEvent(new Event("cookieless:navigation"));
        scheduleScan(`history-${methodName}`, 120, true);
        return result;
      };
    });

    window.addEventListener("cookieless:navigation", () => {
      scheduleScan("navigation-event", 80, true);
    });
  }

  function ensureObserver() {
    if (state.observer || !document.documentElement) {
      return;
    }

    state.observer = new MutationObserver((mutations) => {
      if (!state.pageEnabled) {
        return;
      }

      const shouldScan = mutations.some((mutation) => mutation.type === "childList" && mutation.addedNodes.length || mutation.type === "attributes");
      if (shouldScan) {
        scheduleScan("mutation", 80, false);
      }
    });

    state.observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "style", "open", "aria-hidden"]
    });
  }

  function disconnectObserver() {
    state.observer?.disconnect();
    state.observer = null;
  }

  function ensureEarlyHideStyle() {
    if (!document.documentElement) {
      return;
    }

    const nextCss = CookielessRules.buildEarlyHideCss(state.mode);

    if (!state.earlyStyleTag) {
      state.earlyStyleTag = document.createElement("style");
      state.earlyStyleTag.id = EARLY_STYLE_ID;
      document.documentElement.appendChild(state.earlyStyleTag);
    }

    state.earlyStyleTag.textContent = nextCss;
  }

  function removeEarlyHideStyle() {
    state.earlyStyleTag?.remove();
    state.earlyStyleTag = null;
  }

  function scheduleScan(reason, delayMs, force) {
    if (!state.pageEnabled || shouldSkipOnce()) {
      return;
    }

    clearTimeout(state.scanTimer);
    state.scanTimer = window.setTimeout(() => {
      scanForConsent(reason, { force: Boolean(force) }).catch((error) => {
        log("scan-error", error?.message || "Unexpected scan error.");
      });
    }, delayMs);
  }

  async function scanForConsent(reason, options) {
    if (!state.pageEnabled || !document.documentElement) {
      return;
    }

    if (shouldBypassConsentHandling()) {
      return;
    }

    const handledAdapter = await scanKnownAdapters(reason, options);

    if (!handledAdapter) {
      await scanGenericCandidates(reason, options);
    }
  }

  async function scanKnownAdapters(reason, options) {
    const adapters = CookielessRules.getAdaptersForHost(state.hostname);

    for (const adapter of adapters) {
      const containers = queryElements(adapter.selectors.containers, { allowHidden: true });

      for (const container of dedupeNested(containers)) {
        if (!isCandidateUsable(container, options?.force)) {
          continue;
        }

        state.detectedAdapters.add(adapter.id);
        state.currentDetection = {
          type: "cmp",
          id: adapter.id,
          confidence: adapter.confidence
        };
        log("adapter-detected", `${adapter.id} on ${reason}.`);

        if (state.mode === "visual_only") {
          hideConsentSurface(container, {
            reason: `${adapter.id} visual fallback`,
            cmpId: adapter.id,
            confidence: adapter.confidence,
            cleanup: adapter.cleanup
          });
          return true;
        }

        const rejected = await tryRejectWithAdapter(adapter, container);
        if (rejected) {
          return true;
        }

        hideConsentSurface(container, {
          reason: `${adapter.id} fallback hide`,
          cmpId: adapter.id,
          confidence: adapter.confidence,
          cleanup: adapter.cleanup
        });
        return true;
      }
    }

    return false;
  }

  async function tryRejectWithAdapter(adapter, container) {
    const directRejectButton =
      queryFirst(adapter.selectors.rejectButtons, container, { allowHidden: true }) ||
      queryFirst(adapter.selectors.rejectButtons, document, { allowHidden: true });

    if (directRejectButton && isSafeRejectButton(directRejectButton)) {
      performRejectAction(adapter, container, directRejectButton, "direct", adapter.confidence);
      return true;
    }

    const textRejectButton = findGenericRejectButton(container);
    if (textRejectButton && isSafeRejectButton(textRejectButton)) {
      performRejectAction(adapter, container, textRejectButton, "text-match", adapter.confidence);
      return true;
    }

    if (state.mode !== "strict_reject") {
      return false;
    }

    const configureButton =
      queryFirst(adapter.selectors.configureButtons, container, { allowHidden: true }) ||
      queryFirst(adapter.selectors.configureButtons, document, { allowHidden: true });

    if (!configureButton) {
      return false;
    }

    safeClick(configureButton);
    await wait(120);

    const followUpReject = queryFirst(adapter.selectors.secondaryRejectButtons, document, { allowHidden: true });
    if (followUpReject && isSafeRejectButton(followUpReject)) {
      performRejectAction(adapter, container, followUpReject, "strict-follow-up", adapter.confidence);
      return true;
    }

    return false;
  }

  async function scanGenericCandidates(reason, options) {
    if (!shouldScanGenericCandidates()) {
      return;
    }

    const candidates = queryElements(CookielessRules.genericContainerSelectors, { allowHidden: true })
      .map((element) => ({
        element,
        score: CookielessRules.scoreConsentCandidate(element)
      }))
      .filter((entry) => entry.score.accepted)
      .sort((left, right) => right.score.score - left.score.score);

    for (const candidate of candidates) {
      if (!isCandidateUsable(candidate.element, options?.force)) {
        continue;
      }

      if (CookielessRules.findAdapterForElement(candidate.element)) {
        continue;
      }

      state.currentDetection = {
        type: "generic",
        id: "generic",
        confidence: candidate.score.confidence
      };
      log("generic-detected", `Generic consent candidate scored ${candidate.score.score} on ${reason}.`);

      const rejectButton = findGenericRejectButton(candidate.element);

      if (
        rejectButton &&
        state.mode === "strict_reject" &&
        candidate.score.confidence >= 0.78
      ) {
        performRejectAction(
          { id: "generic", cleanup: { unlock: true, rootClasses: [], extraSelectors: [] } },
          candidate.element,
          rejectButton,
          "generic-strict",
          candidate.score.confidence
        );
        return;
      }

      hideConsentSurface(candidate.element, {
        reason: `generic visual hide on ${reason}`,
        cmpId: "generic",
        confidence: candidate.score.confidence,
        cleanup: { unlock: true, rootClasses: [], extraSelectors: [] }
      });
      return;
    }
  }

  function performRejectAction(adapter, container, button, variant, confidence) {
    const targets = collectHideTargets(container, adapter.cleanup);
    const rootSnapshots = captureRootSnapshots();
    const targetSnapshots = snapshotElements(targets);

    safeClick(button);
    applyCleanup(adapter.cleanup);
    hideSnapshots(targetSnapshots);

    const detail = `${adapter.id} rejected via ${variant}.`;
    const action = {
      kind: "reject",
      cmpId: adapter.id,
      reason: detail,
      targetSnapshots,
      rootSnapshots,
      createdAt: Date.now(),
      reloadRecommended: true
    };

    state.actionStack.push(action);
    state.rejectedCount += 1;
    state.currentOutcome = {
      label: "Rejected",
      detail,
      source: adapter.id === "generic" ? "generic" : "cmp",
      cmpId: adapter.id,
      confidence
    };
    trimActionStack();

    sendRuntimeEvent({
      eventType: "reject",
      cmpId: adapter.id,
      summary: detail,
      outcomeLabel: "Rejected",
      outcomeDetail: detail,
      outcomeSource: adapter.id === "generic" ? "generic" : "cmp",
      confidence
    });

    log("reject", detail);
  }

  function hideConsentSurface(container, metadata) {
    const targets = collectHideTargets(container, metadata.cleanup);
    const rootSnapshots = captureRootSnapshots();
    const targetSnapshots = snapshotElements(targets);

    applyCleanup(metadata.cleanup);
    hideSnapshots(targetSnapshots);

    const detail = metadata.reason || "Banner hidden.";
    const action = {
      kind: "hide",
      cmpId: metadata.cmpId || "generic",
      reason: detail,
      targetSnapshots,
      rootSnapshots,
      createdAt: Date.now(),
      reloadRecommended: false
    };

    state.actionStack.push(action);
    state.hiddenCount += 1;
    state.currentOutcome = {
      label: "Hidden only",
      detail,
      source: metadata.cmpId === "generic" ? "generic" : "cmp",
      cmpId: metadata.cmpId || "generic",
      confidence: Number(metadata.confidence || 0)
    };
    trimActionStack();

    sendRuntimeEvent({
      eventType: "hide",
      cmpId: metadata.cmpId || "generic",
      summary: detail,
      outcomeLabel: "Hidden only",
      outcomeDetail: detail,
      outcomeSource: metadata.cmpId === "generic" ? "generic" : "cmp",
      confidence: Number(metadata.confidence || 0)
    });

    log("hide", detail);
  }

  function collectHideTargets(container, cleanup) {
    const targets = [container];

    CookielessRules.overlaySelectors.forEach((selector) => {
      try {
        document.querySelectorAll(selector).forEach((element) => {
          if (isLikelyBackdrop(element) && !targets.includes(element)) {
            targets.push(element);
          }
        });
      } catch (error) {
        // Ignore invalid selectors.
      }
    });

    findDynamicBackdropCandidates(container).forEach((element) => {
      if (!targets.includes(element)) {
        targets.push(element);
      }
    });

    (cleanup?.extraSelectors || []).forEach((selector) => {
      try {
        document.querySelectorAll(selector).forEach((element) => {
          if (!targets.includes(element)) {
            targets.push(element);
          }
        });
      } catch (error) {
        // Ignore invalid selectors.
      }
    });

    return dedupeNested(targets.filter((element) => element instanceof HTMLElement));
  }

  function applyCleanup(cleanup) {
    if (!cleanup) {
      return;
    }

    if (cleanup.unlock) {
      [document.documentElement, document.body].filter(Boolean).forEach((root) => {
        root.setAttribute("data-cookieless-unlocked", "true");
      });
    }

    const classesToRemove = [...CookielessRules.lockClasses, ...(cleanup.rootClasses || [])];
    [document.documentElement, document.body].filter(Boolean).forEach((root) => {
      classesToRemove.forEach((className) => {
        root.classList.remove(className);
      });
      root.style.setProperty("overflow", "auto", "important");
      root.style.removeProperty("pointer-events");
      root.style.setProperty("filter", "none", "important");
      root.style.setProperty("backdrop-filter", "none", "important");
      root.style.setProperty("-webkit-backdrop-filter", "none", "important");
    });
  }

  function snapshotElements(elements) {
    return elements.map((element) => ({
      element,
      styleText: element.getAttribute("style"),
      ariaHidden: element.getAttribute("aria-hidden"),
      inert: "inert" in element ? Boolean(element.inert) : false,
      hiddenMarker: element.getAttribute("data-cookieless-hidden"),
      veilMarker: element.getAttribute("data-cookieless-veil")
    }));
  }

  function hideSnapshots(targetSnapshots) {
    targetSnapshots.forEach((snapshot) => {
      if (!(snapshot.element instanceof HTMLElement)) {
        return;
      }

      snapshot.element.setAttribute("data-cookieless-hidden", "true");
      snapshot.element.setAttribute("data-cookieless-veil", "true");
      snapshot.element.setAttribute("aria-hidden", "true");

      if ("inert" in snapshot.element) {
        snapshot.element.inert = true;
      }
    });
  }

  function captureRootSnapshots() {
    return [document.documentElement, document.body]
      .filter(Boolean)
      .map((element) => ({
        element,
        className: element.className,
        styleText: element.getAttribute("style"),
        unlocked: element.getAttribute("data-cookieless-unlocked")
      }));
  }

  async function undoLastAction() {
    const action = state.actionStack.pop();

    if (!action) {
      return {
        ok: false,
        error: "Nothing is available to undo in this page."
      };
    }

    restoreSnapshots(action.targetSnapshots);
    restoreRootSnapshots(action.rootSnapshots);
    state.currentOutcome = fallbackOutcome();

    if (action.kind === "reject" && action.reloadRecommended) {
      setSkipOnce();
      location.reload();
      return {
        ok: true,
        message: "The last reject action was undone as far as Cookieless can control. The page is reloading without one-shot automation."
      };
    }

    return {
      ok: true,
      message: "The last Cookieless hide action was restored."
    };
  }

  function restoreSnapshots(targetSnapshots) {
    (targetSnapshots || []).forEach((snapshot) => {
      const element = snapshot?.element;
      if (!(element instanceof HTMLElement)) {
        return;
      }

      if (snapshot.styleText === null) {
        element.removeAttribute("style");
      } else {
        element.setAttribute("style", snapshot.styleText);
      }

      if (snapshot.ariaHidden === null) {
        element.removeAttribute("aria-hidden");
      } else {
        element.setAttribute("aria-hidden", snapshot.ariaHidden);
      }

      if ("inert" in element) {
        element.inert = Boolean(snapshot.inert);
      }

      if (snapshot.hiddenMarker === null) {
        element.removeAttribute("data-cookieless-hidden");
      } else {
        element.setAttribute("data-cookieless-hidden", snapshot.hiddenMarker);
      }

      if (snapshot.veilMarker === null) {
        element.removeAttribute("data-cookieless-veil");
      } else {
        element.setAttribute("data-cookieless-veil", snapshot.veilMarker);
      }
    });
  }

  function restoreRootSnapshots(rootSnapshots) {
    (rootSnapshots || []).forEach((snapshot) => {
      const element = snapshot?.element;
      if (!(element instanceof HTMLElement)) {
        return;
      }

      element.className = snapshot.className || "";

      if (snapshot.styleText === null) {
        element.removeAttribute("style");
      } else {
        element.setAttribute("style", snapshot.styleText);
      }

      if (snapshot.unlocked === null) {
        element.removeAttribute("data-cookieless-unlocked");
      } else {
        element.setAttribute("data-cookieless-unlocked", snapshot.unlocked);
      }
    });
  }

  function buildPageStatus() {
    const effectiveUrl = resolveEffectiveFrameUrl();
    return {
      ok: true,
      supported: true,
      hostname: state.hostname,
      mode: state.mode,
      pageEnabled: state.pageEnabled,
      hiddenCount: state.hiddenCount,
      rejectedCount: state.rejectedCount,
      detectedAdapters: Array.from(state.detectedAdapters),
      outcome: state.currentOutcome,
      currentDetection: state.currentDetection,
      lastAction:
        state.actionStack.length > 0
          ? {
              kind: state.actionStack[state.actionStack.length - 1].kind,
              cmpId: state.actionStack[state.actionStack.length - 1].cmpId,
              reason: state.actionStack[state.actionStack.length - 1].reason
            }
          : null,
      frameUrl: location.href,
      effectiveUrl,
      iframe: window !== window.top,
      initialized: state.initialized
    };
  }

  function buildDebugReport() {
    const effectiveUrl = resolveEffectiveFrameUrl();
    const lines = [
      `Page status for ${effectiveUrl}`,
      `Mode: ${state.mode}`,
      `Site enabled: ${state.pageEnabled ? "yes" : "no"}`,
      `Frame URL: ${location.href}`,
      `Frame type: ${window === window.top ? "top" : "iframe"}`,
      `Outcome: ${state.currentOutcome.label} | ${state.currentOutcome.detail}`,
      `Detection: ${state.currentDetection ? `${state.currentDetection.id} @ ${Math.round(state.currentDetection.confidence * 100)}%` : "none"}`,
      `Hidden count: ${state.hiddenCount}`,
      `Rejected count: ${state.rejectedCount}`,
      `Detected adapters: ${Array.from(state.detectedAdapters).join(", ") || "none"}`,
      `Actions in stack: ${state.actionStack.length}`,
      "Recent activity:"
    ];

    if (!state.activityLog.length) {
      lines.push("- none");
    } else {
      state.activityLog.slice(-12).forEach((entry) => {
        lines.push(`- ${entry.timestampIso} | ${entry.type} | ${entry.message}`);
      });
    }

    return lines.join("\n");
  }

  function trimActionStack() {
    if (state.actionStack.length > 12) {
      state.actionStack = state.actionStack.slice(-12);
    }
  }

  function sendRuntimeEvent(payload) {
    chrome.runtime.sendMessage({
      type: "cookieless-record-event",
      frameUrl: location.href,
      effectiveFrameUrl: resolveEffectiveFrameUrl(),
      parentUrlHint: document.referrer || "",
      pageKey: state.hostname,
      isTopFrame: window === window.top,
      timestamp: Date.now(),
      ...payload
    }).catch(() => {
      // Ignore best-effort runtime reporting failures.
    });
  }

  function log(type, message) {
    const entry = {
      type,
      message: String(message || ""),
      timestampIso: new Date().toISOString()
    };

    state.activityLog.push(entry);
    if (state.activityLog.length > 40) {
      state.activityLog = state.activityLog.slice(-40);
    }

    if (state.debugEnabled) {
      console.log("[Cookieless]", type, message);
    }
  }

  function queryElements(selectors, options) {
    const selectorList = Array.isArray(selectors) ? selectors : [];
    const results = [];

    selectorList.forEach((selector) => {
      try {
        document.querySelectorAll(selector).forEach((element) => {
          if (element instanceof HTMLElement && !results.includes(element) && (options?.allowHidden || isVisible(element))) {
            results.push(element);
          }
        });
      } catch (error) {
        // Ignore invalid selectors.
      }
    });

    return results;
  }

  function queryFirst(selectors, root, options) {
    const scope = root instanceof Document || root instanceof HTMLElement ? root : document;

    for (const selector of Array.isArray(selectors) ? selectors : []) {
      try {
        const match = scope.querySelector(selector);
        if (match instanceof HTMLElement && (options?.allowHidden || isVisible(match))) {
          return match;
        }
      } catch (error) {
        // Ignore invalid selectors.
      }
    }

    return null;
  }

  function isVisible(element) {
    if (!(element instanceof HTMLElement)) {
      return false;
    }

    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
  }

  function isCandidateUsable(element, force) {
    if (!(element instanceof HTMLElement)) {
      return false;
    }

    if (force) {
      return true;
    }

    const seenCount = Number(state.processedElements.get(element) || 0);
    if (seenCount >= 1 || element.closest("[data-cookieless-hidden='true']")) {
      return false;
    }

    state.processedElements.set(element, seenCount + 1);
    const attempts = Number(state.attemptCounts.get(element) || 0) + 1;
    state.attemptCounts.set(element, attempts);
    return attempts <= 3;
  }

  function resetCandidateTracking() {
    state.processedElements = new WeakMap();
    state.attemptCounts = new WeakMap();
  }

  function dedupeNested(elements) {
    return elements.filter(
      (element) =>
        !elements.some((other) => other !== element && other.contains(element))
    );
  }

  function findGenericRejectButton(container) {
    const controls = Array.from(
      container.querySelectorAll("button, [role='button'], a[href], input[type='button'], input[type='submit']")
    );
    return controls.find((control) => isSafeRejectButton(control)) || null;
  }

  function isSafeRejectButton(control) {
    const label = CookielessRules.extractControlText(control);
    return Boolean(label) && CookielessRules.isRejectText(label) && !CookielessRules.isAcceptText(label);
  }

  function safeClick(element) {
    if (!(element instanceof HTMLElement)) {
      return;
    }

    ["pointerdown", "mousedown", "pointerup", "mouseup"].forEach((eventName) => {
      element.dispatchEvent(
        new MouseEvent(eventName, {
          bubbles: true,
          cancelable: true,
          view: window
        })
      );
    });

    element.click();
  }

  function isLikelyBackdrop(element) {
    if (!(element instanceof HTMLElement)) {
      return false;
    }

    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    const lowText = CookielessRules.normalizeText(element.innerText || "").length < 40;
    const hasBlur = [style.filter, style.backdropFilter, style.getPropertyValue("-webkit-backdrop-filter")]
      .some((value) => /blur/i.test(String(value || "")));

    return (
      (style.position === "fixed" || style.position === "absolute" || hasBlur) &&
      rect.width >= window.innerWidth * 0.6 &&
      rect.height >= window.innerHeight * 0.4 &&
      (lowText || hasBlur)
    );
  }

  function findDynamicBackdropCandidates(container) {
    const candidates = [];
    const targetRect = container instanceof HTMLElement
      ? container.getBoundingClientRect()
      : null;

    document.querySelectorAll("body > *").forEach((element) => {
      if (!(element instanceof HTMLElement) || candidates.length >= 18 || element === container || element.contains(container)) {
        return;
      }

      if (isLikelyBackdrop(element) && backdropOverlapsTarget(element, targetRect) && !candidates.includes(element)) {
        candidates.push(element);
      }
    });

    return candidates;
  }

  function backdropOverlapsTarget(element, targetRect) {
    if (!(element instanceof HTMLElement) || !targetRect) {
      return false;
    }

    const rect = element.getBoundingClientRect();
    return (
      rect.left <= targetRect.right &&
      rect.right >= targetRect.left &&
      rect.top <= targetRect.bottom &&
      rect.bottom >= targetRect.top
    );
  }

  function setSkipOnce() {
    try {
      sessionStorage.setItem(SKIP_ONCE_KEY, String(Date.now()));
    } catch (error) {
      // Ignore sessionStorage failures.
    }
  }

  function shouldSkipOnce() {
    try {
      const rawValue = sessionStorage.getItem(SKIP_ONCE_KEY);
      if (!rawValue) {
        return false;
      }

      const ageMs = Date.now() - Number(rawValue);
      sessionStorage.removeItem(SKIP_ONCE_KEY);
      return ageMs < 15000;
    } catch (error) {
      return false;
    }
  }

  function fallbackOutcome() {
    return {
      label: "No action",
      detail: "",
      source: "none",
      cmpId: "",
      confidence: 0
    };
  }

  function wait(delayMs) {
    return new Promise((resolve) => {
      window.setTimeout(resolve, delayMs);
    });
  }

  function shouldBypassConsentHandling() {
    try {
      if (window._cf_chl_opt) {
        log("consent-skip", "Skipped challenge-like page handling.");
        return true;
      }
    } catch (error) {
      // Ignore challenge flag access failures.
    }

    const titleText = CookielessRules.normalizeText(document.title || "");
    const bodyText = CookielessRules.normalizeText(
      document.body?.innerText?.slice(0, 1500) ||
      document.body?.textContent?.slice(0, 1500) ||
      ""
    );

    if (CHALLENGE_TEXT_SIGNALS.some((signal) => titleText.includes(signal) || bodyText.includes(signal))) {
      log("consent-skip", "Skipped challenge-like page handling.");
      return true;
    }

    return false;
  }

  function shouldScanGenericCandidates() {
    if (CookielessRules.shouldBypassGenericHost(state.hostname)) {
      log("consent-skip", `Skipped generic fallback on ${state.hostname}.`);
      return false;
    }

    if (window === window.top) {
      return true;
    }

    const frameHost = getHostnameFromUrl(location.href);
    const effectiveHost = getHostnameFromUrl(resolveEffectiveFrameUrl());
    const parentHost = getHostnameFromUrl(document.referrer);
    const currentHost = frameHost || effectiveHost || state.hostname;

    if (!currentHost) {
      return false;
    }

    if (CookielessRules.shouldBypassGenericHost(currentHost)) {
      log("consent-skip", `Skipped generic fallback on ${currentHost}.`);
      return false;
    }

    if (parentHost && hostsLookRelated(currentHost, parentHost)) {
      return true;
    }

    return CookielessRules.isKnownConsentHost(currentHost) || frameLooksConsentLike();
  }

  function frameLooksConsentLike() {
    const rawText =
      document.body?.innerText?.slice(0, 2200) ||
      document.body?.textContent?.slice(0, 2200) ||
      "";
    const normalizedText = CookielessRules.normalizeText(rawText);

    if (!normalizedText) {
      return false;
    }

    if (CookielessRules.hardBlockSignals.some((signal) => normalizedText.includes(signal))) {
      return false;
    }

    const hasCookieOrConsentCopy =
      CookielessRules.cookieTextSignals.some((signal) => normalizedText.includes(signal)) ||
      CookielessRules.consentTextSignals.some((signal) => normalizedText.includes(signal));

    if (!hasCookieOrConsentCopy) {
      return false;
    }

    const controls = Array.from(
      document.querySelectorAll("button, [role='button'], a[href], input[type='button'], input[type='submit']")
    ).slice(0, 40);

    let rejectControlCount = 0;
    let settingsControlCount = 0;

    for (const control of controls) {
      const label = CookielessRules.extractControlText(control);
      if (!label) {
        continue;
      }

      if (CookielessRules.isRejectText(label)) {
        rejectControlCount += 1;
      }

      if (CookielessRules.settingsTextSignals.some((signal) => label.includes(signal))) {
        settingsControlCount += 1;
      }
    }

    return rejectControlCount > 0 || settingsControlCount > 0;
  }

  function resolveEffectiveFrameUrl() {
    if (!location.href.startsWith("about:blank")) {
      return location.href;
    }

    try {
      return document.referrer ? new URL(document.referrer).href : location.href;
    } catch (error) {
      return document.referrer || location.href;
    }
  }

  function getPageKey() {
    try {
      const pageUrl = new URL(location.href);
      if (pageUrl.protocol === "file:") {
        return "__local_file__";
      }

      if (pageUrl.hostname) {
        return pageUrl.hostname;
      }
    } catch (error) {
      // Fall through to referrer handling below.
    }

    try {
      if (!document.referrer) {
        return "";
      }

      const referrerUrl = new URL(document.referrer);
      return referrerUrl.protocol === "file:" ? "__local_file__" : referrerUrl.hostname;
    } catch (error) {
      return "";
    }
  }

  function getHostnameFromUrl(value) {
    try {
      return value ? new URL(value).hostname : "";
    } catch (error) {
      return "";
    }
  }

  function hostsLookRelated(left, right) {
    const normalizedLeft = CookielessRules.normalizeText(left);
    const normalizedRight = CookielessRules.normalizeText(right);

    return (
      Boolean(normalizedLeft) &&
      Boolean(normalizedRight) &&
      (
        normalizedLeft === normalizedRight ||
        normalizedLeft.endsWith(`.${normalizedRight}`) ||
        normalizedRight.endsWith(`.${normalizedLeft}`)
      )
    );
  }
})();
