import * as pdfjsLib from "pdfjs-dist";
// Vite-friendly worker setup for pdf.js
// This lets pdf.js run parsing in a separate thread.
// The `?worker&url` suffix tells Vite to bundle this as a web worker and give us its URL.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import pdfWorker from "pdfjs-dist/build/pdf.worker.mjs?worker&url";

// Configure the global worker source once for the whole app.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(pdfjsLib as any).GlobalWorkerOptions.workerSrc = pdfWorker;

export { pdfjsLib };

