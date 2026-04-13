# Cookieless Chrome Web Store Release Checklist

## Final Product Checks

- Reload the unpacked extension and confirm the popup shows the consumer-simple layout
- Run `post-change-smoke.ps1`
- Test the popup on:
  - a normal supported site
  - a disabled site
  - a local fixture
  - an unsupported or internal page
- Confirm `Pause on this site` and `Resume on this site` work
- Confirm first `Report broken site` click shows the disclosure modal
- Confirm disclosure acknowledgment is required before submit
- Confirm later `Report broken site` clicks submit directly and show `Reported`

## Listing Asset Checks

- Icon set present:
  - `assets/brand/icons/icon-16.png`
  - `assets/brand/icons/icon-32.png`
  - `assets/brand/icons/icon-48.png`
  - `assets/brand/icons/icon-128.png`
- Five screenshots present in `assets/store/screenshots/`
- Small promo image present
- Marquee image present
- Video thumbnail present

## Store Metadata Checks

- Short description added
- Long description added
- Support URL set to `https://github.com/stiliyan-dev/cookieless/issues`
- Privacy policy URL set to `https://stiliyan-dev.github.io/cookieless/privacy-policy.html`
- Homepage URL set to `https://stiliyan-dev.github.io/cookieless/`
- Privacy practices reviewed and accurate
- Mode labels in listing copy match the popup
- Screenshots match the current popup and product flow

## GitHub Pages Checks

- `docs/index.html` is pushed to the public repo
- `docs/privacy-policy.html` is pushed to the public repo
- GitHub Pages is enabled from `main /docs`
- Privacy policy page loads publicly without login

## Packaging Checks

- Manifest icon paths resolve correctly
- `support.js` points to the live repo URLs
- Version is updated before store upload
- No debugging-only buttons are visible in the popup
- `prepare-release.ps1` creates the two ready-to-zip folders in `C:\ChromeExtension\release\`

## Publish Gate

- If the popup, report-submit flow, or consent handling regresses during smoke testing, stop and fix it before store submission
