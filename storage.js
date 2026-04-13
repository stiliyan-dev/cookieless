/*
  What this file does:
  Defines the shared local storage contract for Cookieless.

  Why it exists:
  The popup, service worker, and content scripts all need one consistent state shape.

  How to extend it:
  Keep launch storage small. Add new keys only when they materially affect user-visible behavior or privacy disclosures.
*/

const CookielessStorage = {
  validModes: ["balanced", "visual_only", "strict_reject"],
  validCookiePolicies: ["allow", "session_only", "block"],
  validReportStatuses: ["idle", "submitted", "duplicate", "error"],
  defaults: {
    mode: "balanced",
    siteOverrides: {},
    sitePolicies: {},
    lastOutcomeBySite: {},
    siteStateSnapshots: {},
    powerToolsEnabled: false,
    cookieAuditEnabled: false,
    debugEnabled: false,
    reportingConsentAcknowledged: false,
    lastReportSubmittedAt: 0,
    lastReportStatus: {
      state: "idle",
      message: "",
      hostname: "",
      url: ""
    },
    stats: {
      hiddenCount: 0,
      rejectedCount: 0,
      blockedOnLoadCount: 0,
      clearedSiteStateCount: 0,
      cookiePolicyChanges: 0,
      reportCount: 0
    }
  },

  async ensureDefaults() {
    const normalized = this.normalizeState(await chrome.storage.local.get(this.defaults));
    await chrome.storage.local.set(normalized);
    return normalized;
  },

  async getState() {
    return this.normalizeState(await chrome.storage.local.get(this.defaults));
  },

  async setMode(mode) {
    const normalizedMode = this.validModes.includes(mode) ? mode : this.defaults.mode;
    await chrome.storage.local.set({ mode: normalizedMode });
    return this.getState();
  },

  async setDebugEnabled(debugEnabled) {
    await chrome.storage.local.set({
      debugEnabled: Boolean(debugEnabled)
    });
    return this.getState();
  },

  async setPowerToolsEnabled(powerToolsEnabled) {
    await chrome.storage.local.set({
      powerToolsEnabled: Boolean(powerToolsEnabled)
    });
    return this.getState();
  },

  async setCookieAuditEnabled(cookieAuditEnabled) {
    await chrome.storage.local.set({
      cookieAuditEnabled: Boolean(cookieAuditEnabled)
    });
    return this.getState();
  },

  async setReportingConsentAcknowledged(acknowledged) {
    await chrome.storage.local.set({
      reportingConsentAcknowledged: Boolean(acknowledged)
    });
    return this.getState();
  },

  async setLastReportStatus(reportStatus) {
    const normalized = this.normalizeReportStatus(reportStatus);
    await chrome.storage.local.set({
      lastReportSubmittedAt: normalized.submittedAt,
      lastReportStatus: {
        state: normalized.state,
        message: normalized.message,
        hostname: normalized.hostname,
        url: normalized.url
      }
    });
    return this.getState();
  },

  async toggleSite(hostname, enabled) {
    const sanitizedHostname = this.sanitizeHostname(hostname);

    if (!sanitizedHostname) {
      return this.getState();
    }

    const state = await this.getState();
    const currentEnabled = this.isSiteEnabled(sanitizedHostname, state.siteOverrides);
    const nextEnabled =
      typeof enabled === "boolean" ? Boolean(enabled) : !currentEnabled;

    await chrome.storage.local.set({
      siteOverrides: {
        ...state.siteOverrides,
        [sanitizedHostname]: {
          enabled: nextEnabled,
          updatedAt: Date.now()
        }
      }
    });

    return this.getState();
  },

  async setSitePolicy(hostname, cookieSetting) {
    const sanitizedHostname = this.sanitizeHostname(hostname);
    const normalizedPolicy = this.validCookiePolicies.includes(cookieSetting)
      ? cookieSetting
      : "allow";

    if (!sanitizedHostname) {
      return this.getState();
    }

    const state = await this.getState();

    await chrome.storage.local.set({
      sitePolicies: {
        ...state.sitePolicies,
        [sanitizedHostname]: {
          cookieSetting: normalizedPolicy,
          updatedAt: Date.now()
        }
      }
    });

    return this.getState();
  },

  async clearSitePolicy(hostname) {
    const sanitizedHostname = this.sanitizeHostname(hostname);
    const state = await this.getState();

    if (!sanitizedHostname || !state.sitePolicies[sanitizedHostname]) {
      return state;
    }

    const nextPolicies = { ...state.sitePolicies };
    delete nextPolicies[sanitizedHostname];

    await chrome.storage.local.set({
      sitePolicies: nextPolicies
    });

    return this.getState();
  },

  async setSiteOutcome(hostname, outcome) {
    const sanitizedHostname = this.sanitizeHostname(hostname);

    if (!sanitizedHostname || !outcome || typeof outcome !== "object") {
      return this.getState();
    }

    const state = await this.getState();

    await chrome.storage.local.set({
      lastOutcomeBySite: {
        ...state.lastOutcomeBySite,
        [sanitizedHostname]: this.normalizeOutcome({
          ...outcome,
          updatedAt: Date.now()
        })
      }
    });

    return this.getState();
  },

  async clearSiteOutcome(hostname) {
    const sanitizedHostname = this.sanitizeHostname(hostname);
    const state = await this.getState();

    if (!sanitizedHostname || !state.lastOutcomeBySite[sanitizedHostname]) {
      return state;
    }

    const nextOutcomes = { ...state.lastOutcomeBySite };
    delete nextOutcomes[sanitizedHostname];

    await chrome.storage.local.set({
      lastOutcomeBySite: nextOutcomes
    });

    return this.getState();
  },

  async setSiteStateSnapshot(hostname, snapshot) {
    const sanitizedHostname = this.sanitizeHostname(hostname);

    if (!sanitizedHostname || !snapshot || typeof snapshot !== "object") {
      return this.getState();
    }

    const state = await this.getState();

    await chrome.storage.local.set({
      siteStateSnapshots: {
        ...state.siteStateSnapshots,
        [sanitizedHostname]: this.normalizeSnapshot({
          ...snapshot,
          updatedAt: Date.now()
        })
      }
    });

    return this.getState();
  },

  async incrementStat(statKey, amount = 1) {
    const state = await this.getState();
    const safeAmount = Number.isFinite(amount) ? Math.max(1, Math.trunc(amount)) : 1;

    await chrome.storage.local.set({
      stats: {
        ...state.stats,
        [statKey]: Math.max(
          0,
          Number(state.stats?.[statKey] || 0) + safeAmount
        )
      }
    });

    return this.getState();
  },

  isSiteEnabled(hostname, siteOverrides) {
    const sanitizedHostname = this.sanitizeHostname(hostname);

    if (!sanitizedHostname) {
      return true;
    }

    const override = siteOverrides?.[sanitizedHostname];

    if (!override || typeof override !== "object") {
      return true;
    }

    return override.enabled !== false;
  },

  getCookiePolicy(hostname, sitePolicies) {
    const sanitizedHostname = this.sanitizeHostname(hostname);
    const policy = sitePolicies?.[sanitizedHostname];
    return this.validCookiePolicies.includes(policy?.cookieSetting)
      ? policy.cookieSetting
      : "allow";
  },

  sanitizeHostname(hostname) {
    return String(hostname || "")
      .trim()
      .toLowerCase()
      .replace(/^\.+/, "")
      .replace(/\.+$/, "");
  },

  normalizeState(rawState) {
    const mode = this.validModes.includes(rawState?.mode)
      ? rawState.mode
      : this.defaults.mode;

    return {
      mode,
      siteOverrides: this.normalizeSiteOverrides(rawState?.siteOverrides),
      sitePolicies: this.normalizeSitePolicies(rawState?.sitePolicies),
      lastOutcomeBySite: this.normalizeOutcomeMap(rawState?.lastOutcomeBySite),
      siteStateSnapshots: this.normalizeSnapshotMap(rawState?.siteStateSnapshots),
      powerToolsEnabled: Boolean(rawState?.powerToolsEnabled),
      cookieAuditEnabled: Boolean(rawState?.cookieAuditEnabled),
      debugEnabled: Boolean(rawState?.debugEnabled),
      reportingConsentAcknowledged: Boolean(rawState?.reportingConsentAcknowledged),
      lastReportSubmittedAt: Math.max(0, Number(rawState?.lastReportSubmittedAt || 0)),
      lastReportStatus: this.normalizeReportStatus({
        state: rawState?.lastReportStatus?.state || rawState?.lastReportStatus,
        message: rawState?.lastReportStatus?.message || "",
        hostname: rawState?.lastReportStatus?.hostname || "",
        url: rawState?.lastReportStatus?.url || "",
        submittedAt: rawState?.lastReportSubmittedAt || rawState?.lastReportStatus?.submittedAt || 0
      }),
      stats: {
        hiddenCount: Math.max(0, Number(rawState?.stats?.hiddenCount || 0)),
        rejectedCount: Math.max(0, Number(rawState?.stats?.rejectedCount || 0)),
        blockedOnLoadCount: Math.max(0, Number(rawState?.stats?.blockedOnLoadCount || 0)),
        clearedSiteStateCount: Math.max(0, Number(rawState?.stats?.clearedSiteStateCount || 0)),
        cookiePolicyChanges: Math.max(0, Number(rawState?.stats?.cookiePolicyChanges || 0)),
        reportCount: Math.max(0, Number(rawState?.stats?.reportCount || 0))
      }
    };
  },

  normalizeSiteOverrides(siteOverrides) {
    if (!siteOverrides || typeof siteOverrides !== "object") {
      return {};
    }

    return Object.entries(siteOverrides).reduce((result, entry) => {
      const hostname = this.sanitizeHostname(entry[0]);

      if (!hostname) {
        return result;
      }

      result[hostname] = {
        enabled: entry[1]?.enabled !== false,
        updatedAt: Number(entry[1]?.updatedAt || 0)
      };
      return result;
    }, {});
  },

  normalizeSitePolicies(sitePolicies) {
    if (!sitePolicies || typeof sitePolicies !== "object") {
      return {};
    }

    return Object.entries(sitePolicies).reduce((result, entry) => {
      const hostname = this.sanitizeHostname(entry[0]);

      if (!hostname) {
        return result;
      }

      result[hostname] = {
        cookieSetting: this.validCookiePolicies.includes(entry[1]?.cookieSetting)
          ? entry[1].cookieSetting
          : "allow",
        updatedAt: Number(entry[1]?.updatedAt || 0)
      };
      return result;
    }, {});
  },

  normalizeOutcomeMap(outcomeMap) {
    if (!outcomeMap || typeof outcomeMap !== "object") {
      return {};
    }

    return Object.entries(outcomeMap).reduce((result, entry) => {
      const hostname = this.sanitizeHostname(entry[0]);

      if (!hostname) {
        return result;
      }

      result[hostname] = this.normalizeOutcome(entry[1]);
      return result;
    }, {});
  },

  normalizeOutcome(outcome) {
    if (!outcome || typeof outcome !== "object") {
      return {
        label: "No action",
        detail: "",
        source: "none",
        cmpId: "",
        confidence: 0,
        updatedAt: 0
      };
    }

    return {
      label: String(outcome.label || "No action"),
      detail: String(outcome.detail || ""),
      source: String(outcome.source || "none"),
      cmpId: String(outcome.cmpId || ""),
      confidence: Math.max(0, Math.min(1, Number(outcome.confidence || 0))),
      updatedAt: Number(outcome.updatedAt || 0)
    };
  },

  normalizeSnapshotMap(snapshotMap) {
    if (!snapshotMap || typeof snapshotMap !== "object") {
      return {};
    }

    return Object.entries(snapshotMap).reduce((result, entry) => {
      const hostname = this.sanitizeHostname(entry[0]);

      if (!hostname) {
        return result;
      }

      result[hostname] = this.normalizeSnapshot(entry[1]);
      return result;
    }, {});
  },

  normalizeSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== "object") {
      return {
        cookies: [],
        cookieCount: 0,
        storageSummary: [],
        updatedAt: 0
      };
    }

    return {
      cookies: Array.isArray(snapshot.cookies)
        ? snapshot.cookies.slice(0, 40).map((cookie) => ({
            name: String(cookie?.name || ""),
            domain: String(cookie?.domain || ""),
            path: String(cookie?.path || "/"),
            secure: Boolean(cookie?.secure),
            session: Boolean(cookie?.session),
            partitioned: Boolean(cookie?.partitioned)
          }))
        : [],
      cookieCount: Math.max(0, Number(snapshot.cookieCount || 0)),
      storageSummary: Array.isArray(snapshot.storageSummary)
        ? snapshot.storageSummary.slice(0, 12).map((entry) => ({
            frameUrl: String(entry?.frameUrl || ""),
            localStorageKeys: Math.max(0, Number(entry?.localStorageKeys || 0)),
            sessionStorageKeys: Math.max(0, Number(entry?.sessionStorageKeys || 0)),
            indexedDbNames: Array.isArray(entry?.indexedDbNames)
              ? entry.indexedDbNames.slice(0, 20).map((name) => String(name || ""))
              : [],
            cacheNames: Array.isArray(entry?.cacheNames)
              ? entry.cacheNames.slice(0, 20).map((name) => String(name || ""))
              : []
          }))
        : [],
      updatedAt: Number(snapshot.updatedAt || 0)
    };
  },

  normalizeReportStatus(reportStatus) {
    const normalizedState = this.validReportStatuses.includes(reportStatus?.state)
      ? reportStatus.state
      : "idle";

    return {
      state: normalizedState,
      message: String(reportStatus?.message || ""),
      hostname: this.sanitizeHostname(reportStatus?.hostname) || String(reportStatus?.hostname || ""),
      url: String(reportStatus?.url || ""),
      submittedAt: Math.max(0, Number(reportStatus?.submittedAt || 0))
    };
  }
};
