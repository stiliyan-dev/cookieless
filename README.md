# Cookieless

Cookieless is a Chrome Manifest V3 extension that makes cookie banners quieter without pretending to click "accept all."

It rejects supported banners when the site exposes a clear reject path, hides the rest visually, and keeps the popup simple enough for normal users to understand at a glance.

## What Users See

- a plain-language mode selector
- a current-site status card
- one per-site recovery action: `Pause on this site` or `Resume on this site`
- one support action: `Report broken site`
- lifetime stats for `Hidden`, `Rejected`, and `Reports`

Broken-site reporting is user-initiated:

1. The first report shows a compact disclosure.
2. After consent, Cookieless sends the current page URL and diagnostic report to support.
3. Later clicks report silently and show `Reported`.

Browsing stays local by default. Reporting only happens when the user clicks the button.

## Modes

The engine storage values stay the same, but the popup labels are simpler:

- `Recommended` (`balanced`): calmer banner handling for everyday browsing
- `Hide only` (`visual_only`): never clicks buttons and only removes banners visually
- `Stronger reject` (`strict_reject`): uses more aggressive reject attempts when confidence is high

Fresh installs default to `Recommended`, while existing saved mode choices are preserved.

## What Happens With Cookies

- If Cookieless rejects a supported banner, it tries to use the page's real reject or decline path.
- If Cookieless only hides a banner, that does not mean all cookies were accepted. It means the banner UI was removed locally.
- Generic fallback is intentionally conservative: it should act only on cookie-related UI, not ordinary site dialogs.
- If a site breaks, pausing Cookieless on that site reloads the page without Cookieless handling.

## Current Build

- local consent handling by default
- packaged DNR rules for known consent resources
- supported CMP adapters plus tighter cookie-only generic fallback
- iframe-aware handling and reporting
- per-site pause or resume with reload recovery
- user-initiated remote reporting through Supabase Edge Functions
- public docs site and store asset pipeline
- manual-zip release prep script

## Shared Config

Public URLs and the report endpoint live in:

- `config.js`

Keep secrets out of that file. It should only contain public URLs and the publishable key.

## Supabase Reporting Setup

Cookieless uses this Supabase project for incoming broken-site reports:

- project ref: `nwehygsvuxwhqqxefhpr`
- function: `report-bug`
- table: `bug_reports`

Deployment flow:

```powershell
cd C:\ChromeExtension\apps\Cookieless
supabase db push
supabase secrets set COOKILESS_REPORT_PUBLIC_KEY=your-supabase-publishable-key
supabase functions deploy report-bug --no-verify-jwt
```

Notes:

- `SUPABASE_SERVICE_ROLE_KEY` stays server-side only inside Supabase
- do not commit `.env` files or DB passwords
- the extension never uses the DB password directly

## Install

1. Open Chrome and go to `chrome://extensions`.
2. Enable `Developer mode`.
3. Click `Load unpacked`.
4. Select `C:\ChromeExtension\apps\Cookieless`.
5. Reload the extension after changes.

## Local Fixtures

1. Load the extension.
2. Open the extension details page in `chrome://extensions`.
3. Enable **Allow access to file URLs** for Cookieless.
4. Open `file:///C:/ChromeExtension/apps/Cookieless/fixtures/index.html`.
5. Use the CMP, iframe, generic, and safety fixtures to validate the content logic.

## HTTP Harness

Run:

```powershell
powershell -ExecutionPolicy Bypass -File C:\ChromeExtension\apps\Cookieless\run-http-harness.ps1
```

Then open:

```text
http://127.0.0.1:8765/index.html
```

## Generate Brand And Store Assets

Run:

```powershell
powershell -ExecutionPolicy Bypass -File C:\ChromeExtension\apps\Cookieless\assets\generate-brand-assets.ps1
```

This generates:

- manifest icon PNGs in `assets/brand/icons/`
- Chrome Web Store screenshots and promo images in `assets/store/`
- GitHub Pages image copies in `docs/assets/`

## Prepare Manual Zip Folders

Run:

```powershell
powershell -ExecutionPolicy Bypass -File C:\ChromeExtension\apps\Cookieless\prepare-release.ps1
```

This creates a ready-to-zip folder in `C:\ChromeExtension\release\` with:

- `Cookieless-<VERSION>-extension-upload\`
- `Cookieless-<VERSION>-listing-assets\`

You zip those two folders manually when you are ready.

## Public Site And Store Files

- docs site: `docs/`
- store listing copy and checklist: `assets/store/`
- publish guide: `GITHUB_PUBLISH.md`
- release packaging notes: `release/README.md`
- Supabase function and migration: `supabase/`

## Smoke Check

Run:

```powershell
powershell -ExecutionPolicy Bypass -File C:\ChromeExtension\apps\Cookieless\post-change-smoke.ps1
```

## Known Limitations

- Cookie banner behavior still varies heavily across sites, especially in iframe-heavy or custom flows.
- Some sites only reach a visual hide outcome, not a full reject outcome.
- Some pages still need a reload after the banner disappears because the site waits for a consent flow to settle.
- Generic fallback is intentionally conservative now, so a few more banners may be missed in exchange for safer site behavior.
- The public repo and GitHub Pages URLs currently assume `stiliyan-dev/cookieless`.
