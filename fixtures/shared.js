(function fixtureConsentHelpers() {
  function setStatus(selector, message) {
    const element = document.querySelector(selector || "#result");
    if (!element) {
      return;
    }

    element.textContent = message;
    element.dataset.fixtureResolved = "true";
  }

  function clearLock() {
    document.body.classList.remove("fixture-lock");
    document.documentElement.classList.remove("fixture-lock");
  }

  function removeTargets(selectors) {
    selectors.forEach((selector) => {
      document.querySelectorAll(selector).forEach((element) => {
        element.remove();
      });
    });
  }

  function bannerWasHidden(banner) {
    return (
      banner.getAttribute("data-cookieless-hidden") === "true" ||
      banner.getAttribute("aria-hidden") === "true" ||
      !document.body.contains(banner)
    );
  }

  function watchBanner(config) {
    const banner = document.querySelector(config.banner);

    if (!banner) {
      return;
    }

    const observer = new MutationObserver(() => {
      const statusElement = document.querySelector(config.status || "#result");

      if (statusElement?.dataset.fixtureResolved === "true") {
        observer.disconnect();
        return;
      }

      if (bannerWasHidden(banner)) {
        setStatus(
          config.status,
          config.hideMessage || "Banner hidden visually by Cookieless."
        );
        observer.disconnect();
      }
    });

    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["data-cookieless-hidden", "aria-hidden", "style"]
    });
  }

  function bind(config) {
    if (config.lockPage !== false) {
      document.body.classList.add("fixture-lock");
      document.documentElement.classList.add("fixture-lock");
    }

    const rejectButton = config.reject ? document.querySelector(config.reject) : null;
    const acceptButton = config.accept ? document.querySelector(config.accept) : null;
    const configureButton = config.configure ? document.querySelector(config.configure) : null;

    rejectButton?.addEventListener("click", () => {
      removeTargets([config.banner, ...(config.cleanup || [])]);
      clearLock();
      setStatus(
        config.status,
        config.rejectMessage || "Fixture rejected optional cookies."
      );
    });

    acceptButton?.addEventListener("click", () => {
      removeTargets([config.banner, ...(config.cleanup || [])]);
      clearLock();
      setStatus(
        config.status,
        config.acceptMessage || "Fixture accepted cookies."
      );
    });

    configureButton?.addEventListener("click", () => {
      setStatus(
        config.status,
        config.configureMessage || "Preferences opened."
      );
    });

    watchBanner(config);
  }

  function injectAfterDelay(delayMs, html, callback) {
    window.setTimeout(() => {
      const host = document.getElementById("fixtureMount") || document.body;
      host.insertAdjacentHTML("beforeend", html);
      callback?.();
    }, delayMs);
  }

  function pushFixtureRoute(label, render) {
    history.pushState({}, "", `${location.pathname}?route=${encodeURIComponent(label)}`);
    render?.();
  }

  window.FixtureConsent = {
    bind,
    injectAfterDelay,
    pushFixtureRoute,
    setStatus
  };
})();
