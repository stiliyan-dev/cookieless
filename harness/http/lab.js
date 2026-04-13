(async function cookielessHarness() {
  const params = new URLSearchParams(location.search);
  const scenario = params.get("case") || "session";
  const scenarioLabel = document.getElementById("scenarioLabel");
  const status = document.getElementById("status");
  const refreshButton = document.getElementById("refreshState");
  const resetButton = document.getElementById("resetLocalState");

  const descriptions = {
    session: "Session cookie case: writes a session cookie and sessionStorage state.",
    persistent: "Persistent cookie case: writes a long-lived cookie and localStorage state.",
    rewrite: "Rewrite case: writes one cookie immediately and rewrites another after a short delay.",
    reload: "Reload case: recreates a cookie on every load unless blocked.",
    storage: "Storage-only case: writes localStorage, sessionStorage, IndexedDB, CacheStorage, and a service worker without HTTP cookies.",
    mixed: "Mixed case: combines cookies, localStorage, IndexedDB, CacheStorage, and a service worker."
  };

  scenarioLabel.textContent = descriptions[scenario] || "Custom harness case.";

  refreshButton.addEventListener("click", renderState);
  resetButton.addEventListener("click", async () => {
    await clearScenarioState();
    await seedScenarioState();
    await renderState();
  });

  await registerServiceWorker();
  await seedScenarioState();
  await renderState();

  async function seedScenarioState() {
    if (scenario === "session") {
      document.cookie = "cookieless_session=1; path=/; SameSite=Lax";
      sessionStorage.setItem("cookieless:session", "1");
      return;
    }

    if (scenario === "persistent") {
      document.cookie = "cookieless_persistent=1; path=/; Max-Age=31536000; SameSite=Lax";
      localStorage.setItem("cookieless:persistent", "1");
      return;
    }

    if (scenario === "rewrite") {
      document.cookie = "cookieless_rewrite_seed=1; path=/; Max-Age=31536000; SameSite=Lax";
      localStorage.setItem("cookieless:rewrite", "seeded");
      window.setTimeout(() => {
        document.cookie = "cookieless_rewritten=1; path=/; Max-Age=31536000; SameSite=Lax";
        renderState();
      }, 1500);
      return;
    }

    if (scenario === "reload") {
      document.cookie = "cookieless_reload=1; path=/; Max-Age=31536000; SameSite=Lax";
      localStorage.setItem("cookieless:reload", String(Date.now()));
      return;
    }

    if (scenario === "storage") {
      await seedStorageOnlyState();
      return;
    }

    await seedMixedState();
  }

  async function seedStorageOnlyState() {
    localStorage.setItem("cookieless:storage", "local");
    sessionStorage.setItem("cookieless:storage", "session");
    await ensureIndexedDb("cookieless-storage-db");
    await ensureCache("cookieless-storage-cache");
  }

  async function seedMixedState() {
    document.cookie = "cookieless_mixed=1; path=/; Max-Age=31536000; SameSite=Lax";
    localStorage.setItem("cookieless:mixed", "local");
    sessionStorage.setItem("cookieless:mixed", "session");
    await ensureIndexedDb("cookieless-mixed-db");
    await ensureCache("cookieless-mixed-cache");
  }

  async function clearScenarioState() {
    [
      "cookieless_session",
      "cookieless_persistent",
      "cookieless_rewrite_seed",
      "cookieless_rewritten",
      "cookieless_reload",
      "cookieless_mixed"
    ].forEach((name) => {
      document.cookie = `${name}=; path=/; Max-Age=0; SameSite=Lax`;
    });

    try {
      localStorage.clear();
    } catch (error) {
      // Ignore storage cleanup failures.
    }

    try {
      sessionStorage.clear();
    } catch (error) {
      // Ignore storage cleanup failures.
    }

    if (typeof indexedDB?.databases === "function") {
      const databases = await indexedDB.databases();
      await Promise.all(
        databases
          .map((entry) => entry?.name)
          .filter(Boolean)
          .map(
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

    if (typeof caches?.keys === "function") {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map((name) => caches.delete(name)));
    }
  }

  async function renderState() {
    const storageSummary = await collectStorageState();
    const lines = [
      `Scenario: ${scenario}`,
      `URL: ${location.href}`,
      `Cookies: ${document.cookie || "(none visible to the page)"}`,
      `localStorage keys: ${storageSummary.localStorageKeys.join(", ") || "(none)"}`,
      `sessionStorage keys: ${storageSummary.sessionStorageKeys.join(", ") || "(none)"}`,
      `IndexedDB: ${storageSummary.indexedDbNames.join(", ") || "(none)"}`,
      `CacheStorage: ${storageSummary.cacheNames.join(", ") || "(none)"}`,
      `Service worker controller: ${navigator.serviceWorker?.controller ? "yes" : "no"}`
    ];

    status.textContent = lines.join("\n");
  }

  async function collectStorageState() {
    const indexedDbNames = typeof indexedDB?.databases === "function"
      ? (await indexedDB.databases()).map((entry) => entry?.name).filter(Boolean)
      : [];
    const cacheNames = typeof caches?.keys === "function" ? await caches.keys() : [];

    return {
      localStorageKeys: Object.keys(localStorage),
      sessionStorageKeys: Object.keys(sessionStorage),
      indexedDbNames,
      cacheNames
    };
  }

  async function ensureIndexedDb(name) {
    await new Promise((resolve) => {
      const request = indexedDB.open(name, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains("items")) {
          request.result.createObjectStore("items", { keyPath: "id" });
        }
      };
      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction("items", "readwrite");
        transaction.objectStore("items").put({ id: "seed", value: Date.now() });
        transaction.oncomplete = () => {
          database.close();
          resolve(true);
        };
        transaction.onerror = () => {
          database.close();
          resolve(false);
        };
      };
      request.onerror = () => resolve(false);
    });
  }

  async function ensureCache(name) {
    if (typeof caches?.open !== "function") {
      return;
    }

    const cache = await caches.open(name);
    await cache.put(
      new Request(`./cache-entry-${encodeURIComponent(name)}.txt`, { cache: "reload" }),
      new Response(`Cookieless cache entry for ${name}`, {
        headers: { "Content-Type": "text/plain" }
      })
    );
  }

  async function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) {
      return;
    }

    try {
      await navigator.serviceWorker.register("./sw.js");
      await navigator.serviceWorker.ready;
    } catch (error) {
      // Ignore harness SW registration failures.
    }
  }
})();
