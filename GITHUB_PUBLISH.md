# Cookieless GitHub Publish Guide

## Target Repo

- Repo: `https://github.com/stiliyan-dev/cookieless`
- Pages home: `https://stiliyan-dev.github.io/cookieless/`
- Privacy policy: `https://stiliyan-dev.github.io/cookieless/privacy-policy.html`
- Support: `https://github.com/stiliyan-dev/cookieless/issues`

## Local Folder To Push

Use this folder as the repo root:

- `C:\ChromeExtension\apps\Cookieless`

## Before Push

1. Create an empty GitHub repository at `stiliyan-dev/cookieless`.
2. Run:

```powershell
cd C:\ChromeExtension\apps\Cookieless
powershell -ExecutionPolicy Bypass -File .\assets\generate-brand-assets.ps1
powershell -ExecutionPolicy Bypass -File .\prepare-release.ps1
```

## First Push

```powershell
cd C:\ChromeExtension\apps\Cookieless
git init
git branch -M main
git remote add origin https://github.com/stiliyan-dev/cookieless.git
git add .
git commit -m "Initial Cookieless launch build"
git push -u origin main
```

If the remote already exists, use:

```powershell
git remote set-url origin https://github.com/stiliyan-dev/cookieless.git
```

## Enable GitHub Pages

In GitHub:

1. Open repo settings.
2. Open `Pages`.
3. Under `Build and deployment`, choose:
   - Source: `Deploy from a branch`
   - Branch: `main`
   - Folder: `/docs`
4. Save.

## Support Link Wiring

The extension popup and docs read public URLs from:

- `config.js`

If your final repo slug or username changes, update that file before store submission so the popup, docs, and listing copy all stay aligned.

## Chrome Web Store URLs

Use these fields in the store:

- Homepage URL: `https://stiliyan-dev.github.io/cookieless/`
- Privacy policy URL: `https://stiliyan-dev.github.io/cookieless/privacy-policy.html`
- Support URL: `https://github.com/stiliyan-dev/cookieless/issues`

## Manual Zip Prep

Run:

```powershell
powershell -ExecutionPolicy Bypass -File C:\ChromeExtension\apps\Cookieless\prepare-release.ps1
```

Then manually zip the two prepared directories in the generated `C:\ChromeExtension\release\Cookieless-<VERSION>-store-upload-<TIMESTAMP>\` folder.
