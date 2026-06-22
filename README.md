# Keep — Personal Product Archive

A mobile-first, offline-capable product memory app. Capture photos, scan a UPC/EAN/QR code where the browser supports native barcode detection, and keep the entry locally in IndexedDB.

## Run locally

Install a current Node.js LTS release, then run:

```bash
npm install
npm run dev
```

Open the address Vite prints on a phone or desktop browser. Use HTTPS (or localhost) for camera access. Install from the browser menu to use the PWA shell.

## Included now

- Offline IndexedDB product storage
- Mobile gallery, instant search, category filtering, product details, deletion
- Camera capture/gallery upload with multiple photos
- Native UPC, EAN, and QR scanning when supported, plus manual barcode entry
- PWA manifest and service worker

## Intentionally next

GitHub OAuth and repository sync require a registered OAuth app or a GitHub token flow; the app exposes the setting state but does not persist secrets or simulate a connection.
