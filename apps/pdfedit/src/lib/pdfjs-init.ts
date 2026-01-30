import * as pdfjsLib from 'pdfjs-dist';

// Set worker from unpkg CDN to avoid bundling issues
// This must be done before any PDF.js operations
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

export { pdfjsLib };
