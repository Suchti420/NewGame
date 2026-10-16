import { defineConfig } from 'vite'

// base './' => alle Asset-Pfade relativ.
// Nötig, damit das Bundle sowohl über den OMGithub-Preview-Server (/)
// als auch aus dem Android-WebView (https://appassets.androidplatform.net/)
// und sogar über file:// geladen werden kann.
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    assetsDir: 'assets',
    // Ziel-WebView älterer Android-Geräte (minSdk 24 / Android 7).
    // esbuild transpiliert ??= und ||= herunter.
    target: 'es2019',
    cssTarget: 'chrome80',
    sourcemap: false,
    reportCompressedSize: true,
    assetsInlineLimit: 4096,
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
})
