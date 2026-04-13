# Cookieless Test Cases

## Core Modes

1. Fresh installs default to `balanced`.
2. Existing stored mode values are preserved after upgrade.
3. `balanced` blocks known consent resources, rejects supported CMPs when safe, and otherwise hides likely cookie-related consent UI.
4. `visual_only` hides banners but never clicks a consent control.
5. `strict_reject` uses supported CMP automation and may click a generic reject control only inside a high-confidence cookie-related dialog.

## Consumer Popup Contract

1. The popup shows only the mode selector, mode help trigger, current-site summary, `Pause on this site` or `Resume on this site`, `Report broken site`, and lifetime stats.
2. The visible mode labels are `Recommended`, `Hide only`, and `Stronger reject`, while storage still writes `balanced`, `visual_only`, and `strict_reject`.
3. The stats card shows only `Hidden`, `Rejected`, and `Reports`.
4. No troubleshooting-only actions are visible in the main popup.

## Report Submission

1. First `Report broken site` click shows a disclosure modal.
2. Confirming disclosure stores `reportingConsentAcknowledged` and submits the report.
3. Later `Report broken site` clicks submit directly without reopening disclosure.
4. Submission payload includes hostname, full URL, mode, outcome label, detected banner, extension version, browser version, report text, and submitted timestamp.
5. Popup shows a clear error when submission fails.
6. No DB password or service role key exists in extension files.

## Supported CMP Fixtures

1. OneTrust rejects in `balanced` and `strict_reject`.
2. Cookiebot rejects in `balanced` and `strict_reject`.
3. TrustArc rejects when selectors are present and otherwise falls back to hide.
4. Usercentrics rejects in `balanced` and `strict_reject`.
5. Didomi rejects in `balanced` and `strict_reject`.
6. Sourcepoint rejects directly and through the iframe fixture.
7. Quantcast Choice rejects in `balanced` and `strict_reject`.
8. CookieYes rejects in `balanced` and `strict_reject`.
9. Osano rejects in `balanced` and `strict_reject`.
10. Termly rejects in `balanced` and `strict_reject`.
11. Complianz rejects in `balanced` and `strict_reject`.
12. Axeptio rejects in `balanced` and `strict_reject`.
13. Cookie Information rejects in `balanced` and `strict_reject`.
14. Crownpeak / Evidon rejects in `balanced` and `strict_reject`.
15. Fides rejects in `balanced` and `strict_reject`, including text-only reject controls inside a recognized CMP container.

## Generic And Resilience Fixtures

1. Delayed banner is handled after late insertion.
2. Unknown custom banner is hidden in `balanced` and `visual_only`.
3. Unknown custom banner uses reject in `strict_reject` only when the dialog is clearly cookie-related.
4. Full-page lock overlay unlocks the page after hide or reject.
5. Accept-only trap is hidden without clicking accept.
6. SPA navigation reinjection is handled after `pushState`.
7. Iframe-hosted consent surfaces report the real parent-page context in the popup and debug report.
8. Cross-origin non-consent iframes such as reCAPTCHA are ignored by the generic detector.

## Safety Cases

1. Negative marketing modal remains visible.
2. Belot-style matchmaking modal remains visible.
3. No-consent fixture remains untouched.
4. Challenge-style pages remain untouched.
5. `belot.bg` generic fallback is bypassed.
6. The consumer popup exposes pause or resume as the only visible recovery action.
