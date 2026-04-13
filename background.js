/*
  What this file does:
  Keeps Cookieless state in sync, manages DNR and cookie-policy controls, and brokers popup-to-page actions.

  Why it exists:
  Cookieless needs one service worker to coordinate tab state, outcome tracking, and explicit power tools.

  How to extend it:
  Add richer historical reporting or a dedicated options page once the internal release stabilizes.
*/

importScripts("config.js", "storage.js", "rules.js", "power-tools.js");

const runtimeByTab = new Map();
const SESSION_RULE_ID_BASE = 900000;
const ALLOW_RESOURCE_TYPES = [
  "script",
  "stylesheet",
  "image",
  "font",
  "xmlhttprequest",
  "ping",
  "media",
  "sub_frame",
  "other"
];

let cookieAuditListenerAttached = false;

chrome.runtime.onInstalled.addListener(async () => {
  await CookielessStorage.ensureDefaults();
  await applyRuntimeState();
  await ensureCookieAuditListener();
  await refreshAllBadges();
});

chrome.runtime.onStartup.addListener(async () => {
  await CookielessStorage.ensureDefaults();
  await applyRuntimeState();
  await ensureCookieAuditListener();
  await refreshAllBadges();
});

chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== "local") {
    return;
  }

  if (changes.mode || changes.siteOverrides || changes.sitePolicies || changes.cookieAuditEnabled) {
    await applyRuntimeState();
    await ensureCookieAuditListener();
    await refreshAllBadges();
    return;
  }

  if (changes.stats || changes.lastOutcomeBySite || changes.siteStateSnapshots) {
    await refreshAllBadges();
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  runtimeByTab.delete(tabId);
});

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    await refreshBadgeForTab(tab);
  } catch (error) {
    // Best effort only.
  }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === "loading" || changeInfo.url) {
    runtimeByTab.delete(tabId);
  }

  if (changeInfo.status || changeInfo.url) {
    await refreshBadgeForTab(tab);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handlers = {
    getStatus: getStatusForActiveTab,
    setMode: () => setMode(message.mode),
    toggleSite: () => toggleSiteForActiveTab(message),
    getReportConsentState: getReportConsentState,
    setReportConsentState: () => setReportConsentState(message.acknowledged),
    submitBugReport: submitBugReportForActiveTab,
    undoLastAction: undoLastActionForActiveTab,
    copyDebugReport: copyDebugReportForActiveTab,
    inspectSiteState: inspectSiteStateForActiveTab,
    clearSiteState: clearSiteStateForActiveTab,
    setSiteCookiePolicy: () => setSiteCookiePolicyForActiveTab(message.cookieSetting),
    reloadWithProtection: reloadWithProtectionForActiveTab,
    retryConsentFlow: retryConsentFlowForActiveTab,
    "cookieless-record-event": () => recordRuntimeEvent(message, sender)
  };

  if (!handlers[message.type]) {
    return false;
  }

  handlers[message.type]().then(sendResponse);
  return true;
});

async function applyRuntimeState() {
  const state = await CookielessStorage.getState();
  await syncRulesetState(state.mode);
  await syncSiteAllowRules(state.siteOverrides);
  await syncCookiePolicies(state.sitePolicies);
}

async function setMode(mode) {
  await CookielessStorage.setMode(mode);
  await applyRuntimeState();
  await refreshAllBadges();
  return getStatusForActiveTab();
}

async function toggleSiteForActiveTab(message) {
  const tab = await getActiveTab();
  const hostname = CookielessPowerTools.getHostnameFromUrl(message?.hostname || tab?.url);

  if (!hostname) {
    return {
      ok: false,
      error: "This tab does not expose a normal hostname."
    };
  }

  const state = await CookielessStorage.getState();
  const currentEnabled = CookielessStorage.isSiteEnabled(hostname, state.siteOverrides);
  const nextEnabled =
    typeof message?.enabled === "boolean" ? Boolean(message.enabled) : !currentEnabled;

  await CookielessStorage.toggleSite(hostname, nextEnabled);

  if (!nextEnabled) {
    await clearCookiePolicyForHost(hostname);
    await CookielessStorage.clearSiteOutcome(hostname);
  }

  await applyRuntimeState();
  await refreshBadgeForTab(tab);

  if (tab?.id) {
    await chrome.tabs.reload(tab.id);
  }

  return {
    ok: true,
    siteEnabled: nextEnabled,
    reloading: true,
    message: nextEnabled
      ? "Cookieless is active on this site again. Reloading now."
      : "Cookieless is paused on this site. Reloading without Cookieless handling."
  };
}

async function getReportConsentState() {
  const state = await CookielessStorage.getState();
  return {
    ok: true,
    reportingConsentAcknowledged: state.reportingConsentAcknowledged,
    disclosureText: CookielessConfig.reportSubmission.disclosureText
  };
}

async function setReportConsentState(acknowledged) {
  await CookielessStorage.setReportingConsentAcknowledged(Boolean(acknowledged));
  return getReportConsentState();
}

async function undoLastActionForActiveTab() {
  const tab = await getActiveTab();
  const runtimeState = runtimeByTab.get(tab?.id) || {};
  const frameId = chooseActionFrameId(runtimeState, tab?.url);

  if (!tab?.id) {
    return {
      ok: false,
      error: "No active tab was available."
    };
  }

  try {
    return await chrome.tabs.sendMessage(
      tab.id,
      { type: "cookieless-undo-last-action" },
      frameId ? { frameId } : undefined
    );
  } catch (error) {
    return {
      ok: false,
      error: "No reversible Cookieless action was found in this tab."
    };
  }
}

async function inspectSiteStateForActiveTab() {
  const tab = await getActiveTab();
  const hostname = CookielessPowerTools.getHostnameFromUrl(tab?.url);

  if (!tab?.id || !hostname || hostname === "__local_file__") {
    return {
      ok: false,
      error: "Inspecting site state requires a normal web page."
    };
  }

  await CookielessStorage.setPowerToolsEnabled(true);
  await CookielessStorage.setCookieAuditEnabled(true);
  await ensureCookieAuditListener();

  const snapshot = await CookielessPowerTools.buildSiteStateSnapshot(tab);
  await CookielessStorage.setSiteStateSnapshot(hostname, snapshot);

  return {
    ok: true,
    snapshot
  };
}

async function clearSiteStateForActiveTab() {
  const tab = await getActiveTab();
  const hostname = CookielessPowerTools.getHostnameFromUrl(tab?.url);

  if (!tab?.id || !hostname || hostname === "__local_file__") {
    return {
      ok: false,
      error: "Clearing site state requires a normal web page."
    };
  }

  await CookielessStorage.setPowerToolsEnabled(true);
  await CookielessStorage.setCookieAuditEnabled(true);
  await ensureCookieAuditListener();

  const cookies = await CookielessPowerTools.getCookiesForHostname(hostname);
  const removedCookies = await CookielessPowerTools.removeCookiesForHost(tab.url, hostname, cookies);
  const storageSummary = await CookielessPowerTools.clearPageStateWithScripting(tab.id);
  await CookielessPowerTools.tryClearBrowsingDataForOrigin(tab.url);

  const snapshot = await CookielessPowerTools.buildSiteStateSnapshot(tab);
  await CookielessStorage.setSiteStateSnapshot(hostname, snapshot);
  await CookielessStorage.setSiteOutcome(hostname, {
    label: "Cleared site state",
    detail: `Removed ${removedCookies.length} cookies and cleared reachable storage.`,
    source: "power-tool",
    cmpId: "",
    confidence: 1
  });
  await CookielessStorage.incrementStat("clearedSiteStateCount", 1);

  patchRuntime(tab.id, {
    lastOutcome: {
      label: "Cleared site state",
      detail: `Removed ${removedCookies.length} cookies and cleared reachable storage.`,
      source: "power-tool",
      cmpId: "",
      confidence: 1
    },
    lastActionSummary: `Cleared site state for ${hostname}.`,
    storageSummary
  });

  await refreshBadgeForTab(tab);

  return {
    ok: true,
    removedCookies,
    storageSummary,
    snapshot
  };
}

async function setSiteCookiePolicyForActiveTab(cookieSetting) {
  const tab = await getActiveTab();
  const hostname = CookielessPowerTools.getHostnameFromUrl(tab?.url);

  if (!tab?.id || !hostname || hostname === "__local_file__") {
    return {
      ok: false,
      error: "Cookie policy changes require a normal web page."
    };
  }

  const normalizedSetting = CookielessStorage.validCookiePolicies.includes(cookieSetting)
    ? cookieSetting
    : "allow";

  await CookielessStorage.setPowerToolsEnabled(true);
  await applyCookiePolicy(hostname, normalizedSetting);
  await CookielessStorage.setSitePolicy(hostname, normalizedSetting);
  await CookielessStorage.incrementStat("cookiePolicyChanges", 1);

  const label = normalizedSetting === "block"
    ? "Cookies blocked"
    : normalizedSetting === "session_only"
      ? "Session-only"
      : "No action";
  const detail = normalizedSetting === "block"
    ? "Future cookies are blocked for this hostname."
    : normalizedSetting === "session_only"
      ? "Cookies are limited to the current session for this hostname."
      : "Cookie policy returned to allow.";

  await CookielessStorage.setSiteOutcome(hostname, {
    label,
    detail,
    source: "power-tool",
    cmpId: "",
    confidence: 1
  });
  patchRuntime(tab.id, {
    lastOutcome: {
      label,
      detail,
      source: "power-tool",
      cmpId: "",
      confidence: 1
    },
    lastActionSummary: `Cookie policy set to ${normalizedSetting} for ${hostname}.`
  });

  await refreshBadgeForTab(tab);
  return getStatusForActiveTab();
}

async function reloadWithProtectionForActiveTab() {
  const tab = await getActiveTab();
  const hostname = CookielessPowerTools.getHostnameFromUrl(tab?.url);

  if (!tab?.id || !hostname) {
    return {
      ok: false,
      error: "No active site was available to reload."
    };
  }

  const state = await CookielessStorage.getState();
  const cookiePolicy = CookielessStorage.getCookiePolicy(hostname, state.sitePolicies);
  const detail = cookiePolicy === "block"
    ? "Reloading with site cookie blocking already active."
    : cookiePolicy === "session_only"
      ? "Reloading with session-only cookies active."
      : "Reloading with DNR and early-hide protection active.";

  await CookielessStorage.setSiteOutcome(hostname, {
    label: "Blocked on load",
    detail,
    source: "reload",
    cmpId: "",
    confidence: 0.75
  });
  await CookielessStorage.incrementStat("blockedOnLoadCount", 1);
  patchRuntime(tab.id, {
    lastOutcome: {
      label: "Blocked on load",
      detail,
      source: "reload",
      cmpId: "",
      confidence: 0.75
    },
    lastActionSummary: `Reload protected requested for ${hostname}.`
  });

  await chrome.tabs.reload(tab.id);
  return {
    ok: true,
    message: "Reloading the page with Cookieless protections active."
  };
}

async function retryConsentFlowForActiveTab() {
  const tab = await getActiveTab();
  const runtimeState = runtimeByTab.get(tab?.id) || {};
  const frameId = chooseActionFrameId(runtimeState, tab?.url);

  if (!tab?.id) {
    return {
      ok: false,
      error: "No active tab was available."
    };
  }

  try {
    const response = await chrome.tabs.sendMessage(
      tab.id,
      { type: "cookieless-retry-consent-flow" },
      frameId ? { frameId } : undefined
    );
    return response?.ok ? response : { ok: false, error: "Cookieless could not retry on this page yet." };
  } catch (error) {
    return {
      ok: false,
      error: "This page was not ready for a retry yet. Reload and try again."
    };
  }
}

async function copyDebugReportForActiveTab() {
  const bundle = await buildDebugReportBundleForActiveTab();
  return {
    ok: true,
    reportText: bundle.reportText
  };
}

async function submitBugReportForActiveTab() {
  const state = await CookielessStorage.getState();

  if (!state.reportingConsentAcknowledged) {
    return {
      ok: false,
      requiresConsent: true,
      error: "Cookieless needs your approval before it can send a report to support."
    };
  }

  const bundle = await buildDebugReportBundleForActiveTab();
  if (!bundle.hostname || !bundle.url) {
    return {
      ok: false,
      error: "Reporting requires a normal website tab."
    };
  }

  try {
    const response = await fetch(CookielessConfig.reportSubmission.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: CookielessConfig.reportSubmission.publicKey,
        "X-Cookieless-Client": "extension",
        "X-Cookieless-Extension-Version": bundle.extensionVersion
      },
      body: JSON.stringify({
        hostname: bundle.hostname,
        url: bundle.url,
        mode: bundle.mode,
        outcomeLabel: bundle.outcomeLabel,
        detectedBanner: bundle.detectedBanner,
        extensionVersion: bundle.extensionVersion,
        browserVersion: bundle.browserVersion,
        reportText: bundle.reportText,
        submittedAt: bundle.submittedAt
      })
    });

    const payload = await parseJsonResponse(response);

    if (!response.ok || payload?.ok === false) {
      const message = payload?.error || "Cookieless could not send this report right now.";
      await CookielessStorage.setLastReportStatus({
        state: "error",
        message,
        hostname: bundle.hostname,
        url: bundle.url,
        submittedAt: Date.now()
      });
      return {
        ok: false,
        error: message
      };
    }

    await CookielessStorage.incrementStat("reportCount", 1);
    await CookielessStorage.setLastReportStatus({
      state: payload?.deduped ? "duplicate" : "submitted",
      message: payload?.deduped
        ? "Cookieless matched a recent copy of this report and refreshed its triage signal."
        : "Cookieless sent this site report to support.",
      hostname: bundle.hostname,
      url: bundle.url,
      submittedAt: Date.now()
    });

    return {
      ok: true,
      deduped: Boolean(payload?.deduped),
      reportId: String(payload?.reportId || "")
    };
  } catch (error) {
    const message = "Cookieless could not reach the report service.";
    await CookielessStorage.setLastReportStatus({
      state: "error",
      message,
      hostname: bundle.hostname,
      url: bundle.url,
      submittedAt: Date.now()
    });
    return {
      ok: false,
      error: message
    };
  }
}

async function buildDebugReportBundleForActiveTab() {
  const tab = await getActiveTab();
  const state = await CookielessStorage.getState();
  const hostname = CookielessPowerTools.getHostnameFromUrl(tab?.url);
  const runtimeState = runtimeByTab.get(tab?.id) || null;
  const permissions = await CookielessPowerTools.getPermissionState();
  const pageStatus = tab?.id ? await requestRelevantFrameStatus(tab.id, runtimeState, tab?.url) : null;
  const pageReport = tab?.id ? await requestRelevantFrameDebugReport(tab.id, runtimeState, tab?.url) : null;
  const snapshot = state.siteStateSnapshots?.[hostname] || null;
  const extensionVersion = chrome.runtime.getManifest().version;
  const browserVersion = navigator.userAgent;
  const submittedAt = new Date().toISOString();

  const lines = [
    "Cookieless Debug Report",
    `Generated: ${submittedAt}`,
    `Extension version: ${extensionVersion}`,
    `Browser version: ${browserVersion}`,
    `Mode: ${state.mode}`,
    `Power tools enabled: ${state.powerToolsEnabled ? "yes" : "no"}`,
    `Cookie audit enabled: ${state.cookieAuditEnabled ? "yes" : "no"}`,
    `URL: ${tab?.url || "n/a"}`,
    `Hostname: ${hostname || "n/a"}`,
    `Site enabled: ${CookielessStorage.isSiteEnabled(hostname, state.siteOverrides) ? "yes" : "no"}`,
    `Cookie policy: ${CookielessStorage.getCookiePolicy(hostname, state.sitePolicies)}`,
    `Permissions: cookies=${permissions.cookies}, contentSettings=${permissions.contentSettings}, browsingData=${permissions.browsingData}, scripting=${permissions.scripting}`,
    `Stats: hidden=${state.stats.hiddenCount}, rejected=${state.stats.rejectedCount}, blockedOnLoad=${state.stats.blockedOnLoadCount}, cleared=${state.stats.clearedSiteStateCount}, policyChanges=${state.stats.cookiePolicyChanges}, reports=${state.stats.reportCount}`
  ];

  if (state.lastOutcomeBySite?.[hostname]) {
    lines.push(`Outcome: ${state.lastOutcomeBySite[hostname].label} | ${state.lastOutcomeBySite[hostname].detail}`);
  }

  if (snapshot) {
    lines.push(`Snapshot: cookies=${snapshot.cookieCount}, storageFrames=${snapshot.storageSummary.length}`);
  }

  if (pageReport?.reportText) {
    lines.push("", pageReport.reportText);
  }

  if (runtimeState?.events?.length) {
    lines.push("", "Runtime events:");
    runtimeState.events.slice(-12).forEach((event) => {
      lines.push(`- ${event.timestampIso} | ${event.eventType} | ${event.summary}${event.frameUrl ? ` | ${event.frameUrl}` : ""}`);
    });
  }

  return {
    hostname: hostname || "",
    url: tab?.url || "",
    mode: state.mode,
    outcomeLabel: state.lastOutcomeBySite?.[hostname]?.label || fallbackOutcome().label,
    detectedBanner: describeDetectedBanner(pageStatus, runtimeState),
    extensionVersion,
    browserVersion,
    submittedAt,
    reportText: lines.join("\n")
  };
}

async function getStatusForActiveTab() {
  const state = await CookielessStorage.getState();
  const tab = await getActiveTab();
  const hostname = CookielessPowerTools.getHostnameFromUrl(tab?.url);
  const runtimeState = runtimeByTab.get(tab?.id) || null;
  const pageStatus = tab?.id ? await requestRelevantFrameStatus(tab.id, runtimeState, tab?.url) : null;

  return {
    ok: true,
    mode: state.mode,
    debugEnabled: state.debugEnabled,
    powerToolsEnabled: state.powerToolsEnabled,
    cookieAuditEnabled: state.cookieAuditEnabled,
    reportingConsentAcknowledged: state.reportingConsentAcknowledged,
    lastReportStatus: state.lastReportStatus,
    reportSubmissionEnabled: Boolean(CookielessConfig.reportSubmission?.endpoint),
    permissions: await CookielessPowerTools.getPermissionState(),
    stats: state.stats,
    siteEnabled: CookielessStorage.isSiteEnabled(hostname, state.siteOverrides),
    siteCookiePolicy: CookielessStorage.getCookiePolicy(hostname, state.sitePolicies),
    hostname,
    tabId: tab?.id || null,
    tabUrl: tab?.url || "",
    pageStatus,
    outcome: state.lastOutcomeBySite?.[hostname] || fallbackOutcome(),
    snapshot: state.siteStateSnapshots?.[hostname] || null,
    runtimeStatus: runtimeState
      ? {
          hiddenCount: runtimeState.hiddenCount || 0,
          rejectedCount: runtimeState.rejectedCount || 0,
          cookieEventCount: runtimeState.cookieEventCount || 0,
          detectedAdapters: Array.from(runtimeState.detectedAdapters || []),
          lastActionSummary: runtimeState.lastActionSummary || "",
          eventCount: runtimeState.events?.length || 0,
          lastEventFrameUrl: runtimeState.lastEventFrameUrl || "",
          genericConfidence: Number(runtimeState.genericConfidence || 0)
        }
      : null
  };
}

async function parseJsonResponse(response) {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    return {
      ok: false,
      error: text
    };
  }
}

async function recordRuntimeEvent(message, sender) {
  const tabId = sender?.tab?.id;

  if (!Number.isInteger(tabId)) {
    return { ok: false, error: "The event did not come from a tab." };
  }

  const tabState = runtimeByTab.get(tabId) || emptyRuntimeState();
  const eventType = String(message.eventType || "info");

  if (message.cmpId) {
    tabState.detectedAdapters.add(String(message.cmpId));
  }

  if (eventType === "hide") {
    tabState.hiddenCount += 1;
    await CookielessStorage.incrementStat("hiddenCount", 1);
  }

  if (eventType === "reject") {
    tabState.rejectedCount += 1;
    await CookielessStorage.incrementStat("rejectedCount", 1);
  }

  const hostname = CookielessPowerTools.getHostnameFromUrl(sender?.tab?.url);
  const summary = String(message.summary || "").slice(0, 220);
  const outcome = normalizeOutcomePayload(message);

  if (outcome && hostname) {
    tabState.lastOutcome = outcome;
    await CookielessStorage.setSiteOutcome(hostname, outcome);
  }

  const resolvedFrameUrl = resolveFrameUrl({
    frameUrl: message.frameUrl,
    effectiveFrameUrl: message.effectiveFrameUrl,
    parentUrlHint: message.parentUrlHint,
    tabUrl: sender?.tab?.url
  });

  tabState.lastActionSummary = summary;
  tabState.lastFrameId = Number.isInteger(sender?.frameId) ? sender.frameId : 0;
  tabState.lastEventFrameUrl = resolvedFrameUrl;
  tabState.genericConfidence = Math.max(Number(tabState.genericConfidence || 0), Number(message.confidence || 0));
  tabState.events.push({
    eventType,
    summary,
    timestampIso: new Date(Number(message.timestamp || Date.now())).toISOString(),
    frameUrl: resolvedFrameUrl
  });

  if (tabState.events.length > 40) {
    tabState.events = tabState.events.slice(-40);
  }

  runtimeByTab.set(tabId, tabState);
  await refreshBadgeForTab(sender.tab);
  return { ok: true };
}

async function syncRulesetState(mode) {
  const enabledRulesets = await chrome.declarativeNetRequest.getEnabledRulesets();
  const shouldEnable = mode !== "visual_only";
  const isEnabled = enabledRulesets.includes(CookielessRules.dnrRulesetId);

  if (shouldEnable === isEnabled) {
    return;
  }

  await chrome.declarativeNetRequest.updateEnabledRulesets({
    enableRulesetIds: shouldEnable ? [CookielessRules.dnrRulesetId] : [],
    disableRulesetIds: shouldEnable ? [] : [CookielessRules.dnrRulesetId]
  });
}

async function syncSiteAllowRules(siteOverrides) {
  const disabledHosts = Object.entries(siteOverrides || {})
    .filter((entry) => entry[1]?.enabled === false)
    .map((entry) => entry[0]);

  const sessionRules = disabledHosts.flatMap((hostname, index) => {
    const ruleId = SESSION_RULE_ID_BASE + index * 2;
    return [
      {
        id: ruleId,
        priority: 1000,
        action: { type: "allow" },
        condition: { initiatorDomains: [hostname], resourceTypes: ALLOW_RESOURCE_TYPES }
      },
      {
        id: ruleId + 1,
        priority: 1000,
        action: { type: "allow" },
        condition: { requestDomains: [hostname], resourceTypes: ALLOW_RESOURCE_TYPES }
      }
    ];
  });

  const existingRules = await chrome.declarativeNetRequest.getSessionRules();
  const existingRuleIds = existingRules.map((rule) => rule.id).filter((id) => id >= SESSION_RULE_ID_BASE);

  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: existingRuleIds,
    addRules: sessionRules
  });
}

async function syncCookiePolicies(sitePolicies) {
  const permissions = await CookielessPowerTools.getPermissionState();

  if (!permissions.contentSettings) {
    return;
  }

  for (const [hostname, policy] of Object.entries(sitePolicies || {})) {
    if (policy?.cookieSetting && policy.cookieSetting !== "allow") {
      await CookielessPowerTools.applyCookiePolicy(hostname, policy.cookieSetting);
    }
  }
}

async function applyCookiePolicy(hostname, setting) {
  const permissions = await CookielessPowerTools.getPermissionState();
  if (!permissions.contentSettings) {
    throw new Error("contentSettings permission is required.");
  }
  await CookielessPowerTools.applyCookiePolicy(hostname, setting);
}

async function clearCookiePolicyForHost(hostname) {
  const permissions = await CookielessPowerTools.getPermissionState();
  if (permissions.contentSettings) {
    await CookielessPowerTools.clearCookiePolicyForHost(hostname);
  }
  await CookielessStorage.clearSitePolicy(hostname);
}

async function requestRelevantFrameStatus(tabId, runtimeState, tabUrl) {
  const preferredFrameIds = buildFrameProbeOrder(runtimeState, tabUrl);

  for (const frameId of preferredFrameIds) {
    try {
      const response = await chrome.tabs.sendMessage(
        tabId,
        { type: "cookieless-get-page-status" },
        { frameId }
      );
      if (response?.ok) {
        return response;
      }
    } catch (error) {
      // Try the next frame candidate.
    }
  }

  return null;
}

async function requestRelevantFrameDebugReport(tabId, runtimeState, tabUrl) {
  const preferredFrameIds = buildFrameProbeOrder(runtimeState, tabUrl);

  for (const frameId of preferredFrameIds) {
    try {
      const response = await chrome.tabs.sendMessage(
        tabId,
        { type: "cookieless-export-debug" },
        { frameId }
      );
      if (response?.ok) {
        return response;
      }
    } catch (error) {
      // Try the next frame candidate.
    }
  }

  return null;
}

async function refreshAllBadges() {
  const tabs = await chrome.tabs.query({});
  await Promise.all(tabs.map((tab) => refreshBadgeForTab(tab)));
}

async function refreshBadgeForTab(tab) {
  if (!Number.isInteger(tab?.id)) {
    return;
  }

  const state = await CookielessStorage.getState();
  const hostname = CookielessPowerTools.getHostnameFromUrl(tab.url);
  const siteEnabled = CookielessStorage.isSiteEnabled(hostname, state.siteOverrides);
  const sitePolicy = CookielessStorage.getCookiePolicy(hostname, state.sitePolicies);
  const outcome = state.lastOutcomeBySite?.[hostname] || null;
  const runtimeState = runtimeByTab.get(tab.id);

  let text = "";
  let color = "#0f766e";

  if (!siteEnabled) {
    text = "OFF";
    color = "#64748b";
  } else if (sitePolicy === "block") {
    text = "BLK";
    color = "#991b1b";
  } else if (sitePolicy === "session_only") {
    text = "SES";
    color = "#b45309";
  } else if (outcome?.label === "Rejected") {
    text = "REJ";
  } else if (outcome?.label === "Hidden only") {
    text = "HID";
    color = "#1d4ed8";
  } else if (outcome?.label === "Cleared site state") {
    text = "CLR";
    color = "#7c3aed";
  } else if (outcome?.label === "Blocked on load") {
    text = "LD";
  } else if (runtimeState?.cookieEventCount) {
    text = "CK";
  } else if (state.mode === "visual_only") {
    text = "VIS";
    color = "#1d4ed8";
  } else {
    text = "ON";
    color = state.mode === "strict_reject" ? "#991b1b" : "#0f766e";
  }

  await chrome.action.setBadgeBackgroundColor({ tabId: tab.id, color });
  await chrome.action.setBadgeText({ tabId: tab.id, text });
}

async function ensureCookieAuditListener() {
  if (cookieAuditListenerAttached) {
    return;
  }

  const permissions = await CookielessPowerTools.getPermissionState();
  const state = await CookielessStorage.getState();

  if (!permissions.cookies || !state.cookieAuditEnabled) {
    return;
  }

  chrome.cookies.onChanged.addListener(handleCookieChange);
  cookieAuditListenerAttached = true;
}

async function handleCookieChange(changeInfo) {
  const cookie = changeInfo?.cookie;

  if (!cookie) {
    return;
  }

  const tabs = await chrome.tabs.query({});

  for (const tab of tabs) {
    const hostname = CookielessPowerTools.getHostnameFromUrl(tab.url);
    if (!Number.isInteger(tab.id) || !CookielessPowerTools.domainMatchesHost(cookie.domain, hostname)) {
      continue;
    }

    const tabState = runtimeByTab.get(tab.id) || emptyRuntimeState();
    tabState.cookieEventCount += 1;
    tabState.lastActionSummary = changeInfo.removed ? `Cookie removed: ${cookie.name}` : `Cookie changed: ${cookie.name}`;
    tabState.events.push({
      eventType: "cookie",
      summary: `${changeInfo.removed ? "Removed" : "Changed"} cookie ${cookie.name}`,
      timestampIso: new Date().toISOString(),
      frameUrl: tab.url
    });

    if (tabState.events.length > 40) {
      tabState.events = tabState.events.slice(-40);
    }

    runtimeByTab.set(tab.id, tabState);
    await refreshBadgeForTab(tab);
  }
}

function patchRuntime(tabId, patch) {
  if (!Number.isInteger(tabId)) {
    return;
  }

  const current = runtimeByTab.get(tabId) || emptyRuntimeState();
  runtimeByTab.set(tabId, {
    ...current,
    ...patch
  });
}

function emptyRuntimeState() {
  return {
    hiddenCount: 0,
    rejectedCount: 0,
    cookieEventCount: 0,
    detectedAdapters: new Set(),
    events: [],
    lastFrameId: 0,
    lastEventFrameUrl: "",
    lastActionSummary: "",
    lastOutcome: null,
    genericConfidence: 0,
    storageSummary: []
  };
}

function buildFrameProbeOrder(runtimeState, tabUrl) {
  const frameIds = [];
  const preferredFrameId = chooseActionFrameId(runtimeState, tabUrl);

  frameIds.push(preferredFrameId);

  if (!frameIds.includes(0)) {
    frameIds.push(0);
  }

  return frameIds;
}

function chooseActionFrameId(runtimeState, tabUrl) {
  return shouldPreferTopFrame(runtimeState, tabUrl)
    ? 0
    : Number.isInteger(runtimeState?.lastFrameId)
      ? runtimeState.lastFrameId
      : 0;
}

function normalizeOutcomePayload(message) {
  if (!message?.outcomeLabel) {
    return null;
  }

  return {
    label: String(message.outcomeLabel || "No action"),
    detail: String(message.outcomeDetail || message.summary || ""),
    source: String(message.outcomeSource || "runtime"),
    cmpId: String(message.cmpId || ""),
    confidence: Math.max(0, Math.min(1, Number(message.confidence || 0)))
  };
}

function resolveFrameUrl(details) {
  const directUrl = String(details?.effectiveFrameUrl || details?.frameUrl || "").trim();
  if (directUrl && !directUrl.startsWith("about:blank")) {
    return directUrl;
  }

  const parentUrl = String(details?.parentUrlHint || "").trim();
  if (parentUrl) {
    return parentUrl;
  }

  return String(details?.tabUrl || details?.frameUrl || "").trim();
}

function shouldPreferTopFrame(runtimeState, tabUrl) {
  const tabHost = getHostnameFromUrl(tabUrl);
  const frameHost = getHostnameFromUrl(runtimeState?.lastEventFrameUrl);

  if (!frameHost || !tabHost) {
    return false;
  }

  if (hostsLookRelated(frameHost, tabHost) || CookielessRules.isKnownConsentHost(frameHost)) {
    return false;
  }

  return true;
}

function getHostnameFromUrl(value) {
  try {
    return value ? new URL(value).hostname : "";
  } catch (error) {
    return "";
  }
}

function hostsLookRelated(left, right) {
  const normalizedLeft = String(left || "").toLowerCase();
  const normalizedRight = String(right || "").toLowerCase();

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

function fallbackOutcome() {
  return {
    label: "No action",
    detail: "",
    source: "none",
    cmpId: "",
    confidence: 0,
    updatedAt: 0
  };
}

function describeDetectedBanner(pageStatus, runtimeState) {
  const detection = pageStatus?.currentDetection;

  if (detection?.type === "cmp") {
    return `Recognized banner: ${humanizeDetectorId(detection.id)}.`;
  }

  if (detection?.type === "generic") {
    return "Saw a cookie-related banner, but not a named one yet.";
  }

  const adapters = Array.from(runtimeState?.detectedAdapters || []);
  if (adapters.length) {
    return `Recently recognized: ${adapters.slice(0, 2).map(humanizeDetectorId).join(", ")}.`;
  }

  return "No recognized banner yet.";
}

function humanizeDetectorId(value) {
  const normalized = String(value || "").replace(/[_-]+/g, " ").trim();
  if (!normalized) {
    return "Unknown";
  }

  return normalized.replace(/\b\w/g, (match) => match.toUpperCase());
}

function buildExportTextForReport(report) {
  const lines = [
    report.reportText || ""
  ];

  if (report.notes) {
    lines.push("", "Notes:", report.notes);
  }

  return lines.join("\n");
}

function formatFileStamp(timestamp) {
  const date = new Date(Number(timestamp || Date.now()));
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${year}${month}${day}-${hours}${minutes}${seconds}`;
}

function sanitizeFilename(value) {
  return String(value || "cookieless")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "") || "cookieless";
}

function createBugReportId() {
  if (typeof crypto?.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `report-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });
  return tab || null;
}
