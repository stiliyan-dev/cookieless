# Cookieless Manual Test Plan

## Fixture Pass

1. Load `C:\ChromeExtension\apps\Cookieless`.
2. Enable **Allow access to file URLs**.
3. Open `file:///C:/ChromeExtension/apps/Cookieless/fixtures/index.html`.
4. Run each CMP fixture once in `balanced`.
5. Re-run the same fixtures in `visual_only` and confirm no buttons are clicked.
6. Run `unknown-custom.html` and `full-page-lock.html` in `strict_reject` and confirm the reject button is used only when the dialog is clearly cookie-related.
7. Run `fides.html` in `balanced` and confirm the recognized CMP path finds the text-only `Reject all` button.
8. Run `challenge-page.html` and confirm Cookieless does not hide or click anything.
9. Run `accept-only-trap.html` and confirm the banner is hidden without clicking accept.
10. Run `negative-modal.html`, `belot-matchmaking.html`, and `no-consent.html` and confirm they remain untouched.

## Iframe And SPA Checks

1. Open `iframe-host.html` and confirm the popup shows an iframe-related detection summary instead of an empty or wrong-frame status.
2. Send a report from the iframe case and confirm it points at the parent page context, not just `about:blank`.
3. Open `spa-navigation.html`, trigger the route change, and confirm the injected banner is handled after navigation.

## Popup And Report Checks

1. On any fixture page, hide or reject one banner.
2. Open the popup and confirm current hostname, outcome label, detection summary, and page summary are populated.
3. Confirm the mode selector shows `Recommended`, `Hide only`, and `Stronger reject`.
4. Confirm the help popover explains the three browsing styles.
5. Confirm `Pause on this site` is the only full-size recovery button.
6. Click `Report broken site` for the first time and confirm the disclosure modal appears.
7. Confirm the disclosure text explains full URL and diagnostic data are sent to support.
8. Confirm report submission requires the acknowledgment checkbox.
9. Confirm later `Report broken site` clicks submit without reopening the disclosure modal.
10. Confirm successful submission shows a clear `Reported` status message without redirecting.

## Site-State Harness Checks

1. Run `powershell -ExecutionPolicy Bypass -File C:\ChromeExtension\apps\Cookieless\run-http-harness.ps1`.
2. Open `http://127.0.0.1:8765/index.html`.
3. Test the session, persistent, rewrite, reload, storage-only, and mixed cases.
4. If internal tooling is enabled for development, verify cookie and storage controls still work outside the consumer popup path.
5. Confirm those actions are not visible in the main popup.

## Live-Site Smoke Suggestions

- 5 OneTrust sites
- 5 Cookiebot sites
- 5 Usercentrics sites
- 5 Didomi sites
- 5 Sourcepoint or iframe-heavy news sites
- 10 unknown cookie-banner sites
- `belot.bg` login, queue, and play flow

For each live site, check:

- consent UI removed or rejected
- no broken scrolling
- no broken login, payment, or gameplay entry points
- iframe cases report correctly
- site-disable recovery works
- user-initiated remote report submit works
