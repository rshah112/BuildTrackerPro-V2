// Custom pdf.js worker entry. The polyfill import comes FIRST so Promise.withResolvers exists
// in the worker context before pdf.js's worker code (which calls it) is evaluated — ES-module
// import order is guaranteed. Vite bundles this whole module into the worker via `?worker`.
import './installWithResolvers'
import 'pdfjs-dist/build/pdf.worker.min.mjs'
