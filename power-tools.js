/*
  What this file does:
  Provides the advanced cookie and site-state helpers for Cookieless.

  Why it exists:
  The service worker needs explicit, reusable tools for inspection, clearing, and per-site policy changes.

  How to extend it:
  Add richer summaries or more targeted cleanup once the product learns which escalations work best.
*/

const CookielessPowerTools = {
  async getPermissionState() {
    const [cookies, contentSettings, browsingData, scripting] = await Promise.all([
      chrome.permissions.contains({ permissions: ["cookies"] }),
      chrome.permissions.contains({ permissions: ["contentSettings"] }),
      chrome.permissions.contains({ permissions: ["browsingData"] }),
      chrome.permissions.contains({ permissions: ["scripting"] })
    ]);

    return {
      cookies,
      contentSettings,
      browsingData,
      scripting
    };
  },

  async getCookiesForHostname(hostname) {
    const allCookies = await chrome.cookies.getAll({});
    return allCookies.filter((cookie) =>
      this.domainMatchesHost(cookie.domain, hostname)
    );
  },

  async removeCookiesForHost(tabUrl, hostname, cookies) {
    const cookieList = Array.isArray(cookies) ? cookies : await this.getCookiesForHostname(hostname);
    const removals = [];

    for (const cookie of cookieList) {
      try {
        const details = {
          url: this.buildCookieUrl(cookie, tabUrl),
          name: cookie.name
        };

        if (cookie.storeId) {
          details.storeId = cookie.storeId;
        }

        if (cookie.partitionKey) {
          details.partitionKey = cookie.partitionKey;
        }

        const removal = await chrome.cookies.remove(details);
        if (removal) {
          removals.push({
            name: cookie.name,
            domain: cookie.domain
          });
        }
      } catch (error) {
        // Ignore individual cookie removal failures.
      }
    }

    return removals;
  },

  async buildSiteStateSnapshot(tab) {
    const hostname = this.getHostnameFromUrl(tab?.url);
    const cookies = hostname && hostname !== "__local_file__"
      ? await this.getCookiesForHostname(hostname)
      : [];
    const storageSummary = Number.isInteger(tab?.id)
      ? await this.inspectPageStateWithScripting(tab.id)
      : [];

    return {
      cookies: cookies.map((cookie) => ({
        name: cookie.name,
        domain: cookie.domain,
        path: cookie.path,
        secure: Boolean(cookie.secure),
        session: Boolean(cookie.session),
        partitioned: Boolean(cookie.partitionKey)
      })),
      cookieCount: cookies.length,
      storageSummary
    };
  },

  async inspectPageStateWithScripting(tabId) {
    const injectionResults = await chrome.scripting.executeScript({
      target: {
        tabId,
        allFrames: true
      },
      world: "MAIN",
      func: async () => {
        const indexedDbNames = typeof indexedDB?.databases === "function"
          ? (await indexedDB.databases()).map((db) => db?.name).filter(Boolean)
          : [];
        const cacheNames = typeof caches?.keys === "function"
          ? await caches.keys()
          : [];

        return {
          frameUrl: location.href,
          localStorageKeys: (() => {
            try {
              return localStorage.length;
            } catch (error) {
              return 0;
            }
          })(),
          sessionStorageKeys: (() => {
            try {
              return sessionStorage.length;
            } catch (error) {
              return 0;
            }
          })(),
          indexedDbNames,
          cacheNames
        };
      }
    });

    return injectionResults.map((entry) => entry.result).filter(Boolean);
  },

  async clearPageStateWithScripting(tabId) {
    const injectionResults = await chrome.scripting.executeScript({
      target: {
        tabId,
        allFrames: true
      },
      world: "MAIN",
      func: async () => {
        let localStorageKeys = 0;
        let sessionStorageKeys = 0;
        let indexedDbNames = [];
        let cacheNames = [];

        try {
          localStorageKeys = localStorage.length;
          localStorage.clear();
        } catch (error) {
          localStorageKeys = 0;
        }

        try {
          sessionStorageKeys = sessionStorage.length;
          sessionStorage.clear();
        } catch (error) {
          sessionStorageKeys = 0;
        }

        try {
          if (typeof indexedDB?.databases === "function") {
            indexedDbNames = (await indexedDB.databases())
              .map((db) => db?.name)
              .filter(Boolean);
            await Promise.all(
              indexedDbNames.map(
                (name) =>
                  new Promise((resolve) => {
                    const request = indexedDB.deleteDatabase(name);
                    request.onsuccess = () => resolve(true);
                    request.onerror = () => resolve(false);
                    request.onblocked = () => resolve(false);
                  })
              )
            );
          }
        } catch (error) {
          indexedDbNames = [];
        }

        try {
          if (typeof caches?.keys === "function") {
            cacheNames = await caches.keys();
            await Promise.all(cacheNames.map((name) => caches.delete(name)));
          }
        } catch (error) {
          cacheNames = [];
        }

        return {
          frameUrl: location.href,
          localStorageKeys,
          sessionStorageKeys,
          indexedDbNames,
          cacheNames
        };
      }
    });

    return injectionResults.map((entry) => entry.result).filter(Boolean);
  },

  async tryClearBrowsingDataForOrigin(url) {
    const origin = this.getOriginFromUrl(url);

    if (!origin) {
      return;
    }

    try {
      await chrome.browsingData.remove(
        { origins: [origin] },
        {
          cacheStorage: true,
          indexedDB: true,
          localStorage: true,
          serviceWorkers: true
        }
      );
    } catch (error) {
      // Ignore targeted browsingData cleanup failures.
    }
  },

  async applyCookiePolicy(hostname, cookieSetting) {
    const patterns = this.buildContentSettingPatterns(hostname);

    for (const pattern of patterns) {
      await chrome.contentSettings.cookies.set({
        primaryPattern: pattern,
        setting: cookieSetting,
        scope: "regular"
      });
    }
  },

  async clearCookiePolicyForHost(hostname) {
    const patterns = this.buildContentSettingPatterns(hostname);

    for (const pattern of patterns) {
      await chrome.contentSettings.cookies.clear({
        primaryPattern: pattern,
        scope: "regular"
      });
    }
  },

  buildContentSettingPatterns(hostname) {
    const normalizedHost = String(hostname || "").trim().toLowerCase();

    if (!normalizedHost || normalizedHost === "__local_file__") {
      return [];
    }

    const basePatterns = [
      `http://${normalizedHost}/*`,
      `https://${normalizedHost}/*`
    ];

    if (normalizedHost.includes(".")) {
      basePatterns.push(`http://*.${normalizedHost}/*`);
      basePatterns.push(`https://*.${normalizedHost}/*`);
    }

    return [...new Set(basePatterns)];
  },

  buildCookieUrl(cookie, currentTabUrl) {
    const safeDomain = String(cookie?.domain || "")
      .replace(/^\./, "")
      .trim() || this.getHostnameFromUrl(currentTabUrl);
    const scheme = cookie?.secure ? "https://" : "http://";
    const path = String(cookie?.path || "/");
    return `${scheme}${safeDomain}${path.startsWith("/") ? path : `/${path}`}`;
  },

  domainMatchesHost(cookieDomain, hostname) {
    const cleanDomain = String(cookieDomain || "").replace(/^\./, "").toLowerCase();
    const cleanHost = String(hostname || "").toLowerCase();

    return Boolean(
      cleanDomain &&
      cleanHost &&
      (cleanHost === cleanDomain || cleanHost.endsWith(`.${cleanDomain}`))
    );
  },

  getHostnameFromUrl(url) {
    try {
      const parsed = new URL(String(url || ""));
      return parsed.protocol === "file:" ? "__local_file__" : parsed.hostname;
    } catch (error) {
      return "";
    }
  },

  getOriginFromUrl(url) {
    try {
      return new URL(String(url || "")).origin;
    } catch (error) {
      return "";
    }
  }
};
