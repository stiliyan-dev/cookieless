# Cookieless Release Notes

Run this command:

powershell -ExecutionPolicy Bypass -File C:\ChromeExtension\apps\Cookieless\prepare-release.ps1

Latest prepared release folder:

- C:\ChromeExtension\release\Cookieless-0.5.0-store-upload-20260413-083053

Inside that folder:

- C:\ChromeExtension\release\Cookieless-0.5.0-store-upload-20260413-083053\Cookieless-0.5.0-extension-upload
- C:\ChromeExtension\release\Cookieless-0.5.0-store-upload-20260413-083053\Cookieless-0.5.0-listing-assets

Manual store submission flow:

1. Zip Cookieless-0.5.0-extension-upload\ for the Chrome Web Store extension upload.
2. Zip Cookieless-0.5.0-listing-assets\ if you want one shareable archive of the screenshots, listing copy, and docs.
3. Use the files in docs\ for GitHub Pages publishing.
