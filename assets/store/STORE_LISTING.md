# Cookieless Chrome Web Store Listing

## Short Description

Quiet cookie banner handling for Chrome with optional broken-site reporting and per-site pause.

## Long Description

Cookieless makes cookie banners quieter without pretending to click "accept all."

The extension starts with a local-first browsing approach: it blocks known consent resources when safe, rejects supported banners, and hides the rest visually so pages feel cleaner and faster to use. When a site misbehaves, the user can pause Cookieless on that site immediately from the popup and reload the page without Cookieless handling.

Cookieless is designed to feel simple in daily use. The popup keeps only the essentials: a clear browsing mode, a current-site status summary, a per-site pause or resume button, and a `Report broken site` action.

Broken-site reporting is optional and user-initiated. When the user chooses to report a site, Cookieless sends the current page URL and diagnostic info to support so the issue can be reviewed and fixed. Browsing behavior stays local by default.

## Feature Bullets

- Quiet cookie handling by default
- Rejects supported banners and hides the rest visually
- Never relies on auto-accept behavior
- Per-site pause or resume with reload recovery
- User-initiated broken-site reporting
- No analytics and no remote rule feed in this build

## Mode Labels

- `Recommended`: calmer banner handling for everyday browsing
- `Hide only`: never clicks buttons and only removes banners visually
- `Stronger reject`: uses more aggressive reject attempts when confidence is high

## Privacy Summary

- Browsing behavior stays local by default
- No backend analytics
- No account or sign-in flow for users
- No remote config in this build
- Broken-site reports are sent only when the user clicks the report button
- Broken-site reports include the current page URL and diagnostic support data

## Support / Contact Text

Support URL:
`https://github.com/stiliyan-dev/cookieless/issues`

Suggested contact line:
`For public support questions, release feedback, or curated engineering issues, use the GitHub Issues page at https://github.com/stiliyan-dev/cookieless/issues.`

## Public Website URLs

- Homepage: `https://stiliyan-dev.github.io/cookieless/`
- Privacy policy: `https://stiliyan-dev.github.io/cookieless/privacy-policy.html`

## Asset Inventory

- Icon set: `assets/brand/icons/`
- Screenshots:
  - `assets/store/screenshots/screenshot-01-popup-overview.png`
  - `assets/store/screenshots/screenshot-02-quiet-handling.png`
  - `assets/store/screenshots/screenshot-03-report-flow.png`
  - `assets/store/screenshots/screenshot-04-site-pause.png`
  - `assets/store/screenshots/screenshot-05-local-first.png`
- Small promo: `assets/store/small-promo-440x280.png`
- Marquee: `assets/store/marquee-1400x560.png`
- Video thumbnail: `assets/store/video-thumbnail-1280x720.png`
