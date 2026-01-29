import { useState, useRef, useEffect, useCallback } from 'react';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

// Set worker from local module
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

interface TextItem {
  id: string;
  text: string;
  originalText: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  fontName: string;
  detectedFont: FontName;
  page: number;
  modified: boolean;
}

interface PageData {
  width: number;
  height: number;
  textItems: TextItem[];
}

const FONT_OPTIONS = [
  { value: 'Helvetica', label: 'Helvetica' },
  { value: 'Helvetica-Bold', label: 'Helvetica Bold' },
  { value: 'Helvetica-Oblique', label: 'Helvetica Italic' },
  { value: 'Helvetica-BoldOblique', label: 'Helvetica Bold Italic' },
  { value: 'TimesRoman', label: 'Times Roman' },
  { value: 'TimesRoman-Bold', label: 'Times Roman Bold' },
  { value: 'TimesRoman-Italic', label: 'Times Roman Italic' },
  { value: 'TimesRoman-BoldItalic', label: 'Times Roman Bold Italic' },
  { value: 'Courier', label: 'Courier' },
  { value: 'Courier-Bold', label: 'Courier Bold' },
  { value: 'Courier-Oblique', label: 'Courier Italic' },
  { value: 'Courier-BoldOblique', label: 'Courier Bold Italic' },
] as const;

type FontName = typeof FONT_OPTIONS[number]['value'];

// Auto-detect best matching standard font from PDF font name
function detectBestFont(fontName: string): FontName {
  const lower = fontName.toLowerCase();
  // Remove common prefixes like "ABCDEF+" for subset fonts
  const cleaned = lower.replace(/^[a-z]{6}\+/i, '');

  // Detect bold - check various patterns
  const isBold =
    cleaned.includes('bold') ||
    cleaned.includes('black') ||
    cleaned.includes('heavy') ||
    cleaned.includes('semibold') ||
    cleaned.includes('demibold') ||
    cleaned.includes('-bd') ||
    cleaned.endsWith('bd') ||
    /[\-_]?b$/i.test(cleaned) ||
    cleaned.includes('700') ||
    cleaned.includes('800') ||
    cleaned.includes('900');

  // Detect italic/oblique
  const isItalic =
    cleaned.includes('italic') ||
    cleaned.includes('oblique') ||
    cleaned.includes('inclined') ||
    cleaned.includes('-it') ||
    cleaned.endsWith('it') ||
    /[\-_]?i$/i.test(cleaned);

  // Detect font family
  const isSerif =
    cleaned.includes('times') ||
    cleaned.includes('serif') ||
    cleaned.includes('roman') ||
    cleaned.includes('georgia') ||
    cleaned.includes('palatino') ||
    cleaned.includes('cambria') ||
    cleaned.includes('garamond');

  const isMono =
    cleaned.includes('courier') ||
    cleaned.includes('mono') ||
    cleaned.includes('code') ||
    cleaned.includes('consol') ||
    cleaned.includes('fixed') ||
    cleaned.includes('terminal');

  // Return appropriate font
  if (isSerif) {
    if (isBold && isItalic) return 'TimesRoman-BoldItalic';
    if (isBold) return 'TimesRoman-Bold';
    if (isItalic) return 'TimesRoman-Italic';
    return 'TimesRoman';
  }

  if (isMono) {
    if (isBold && isItalic) return 'Courier-BoldOblique';
    if (isBold) return 'Courier-Bold';
    if (isItalic) return 'Courier-Oblique';
    return 'Courier';
  }

  // Default to Helvetica (sans-serif)
  if (isBold && isItalic) return 'Helvetica-BoldOblique';
  if (isBold) return 'Helvetica-Bold';
  if (isItalic) return 'Helvetica-Oblique';
  return 'Helvetica';
}

function App() {
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [pages, setPages] = useState<PageData[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [scale, setScale] = useState(1.5);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pdfDocRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError(null);
    setFileName(file.name);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      setPdfBytes(bytes);

      // Load with pdf.js
      const loadingTask = pdfjsLib.getDocument({ data: bytes });
      const pdfDoc = await loadingTask.promise;
      pdfDocRef.current = pdfDoc;

      // Extract text from all pages
      const pagesData: PageData[] = [];

      for (let i = 0; i < pdfDoc.numPages; i++) {
        const page = await pdfDoc.getPage(i + 1);
        const viewport = page.getViewport({ scale: 1 });
        const textContent = await page.getTextContent();

        const textItems: TextItem[] = (textContent.items as any[])
          .filter(item => 'str' in item && item.str && item.str.trim() !== '')
          .map((item, idx) => {
            const tx = item.transform;
            const h = item.height || Math.abs(tx[3]) || 12;
            const fontName = item.fontName || '';
            return {
              id: `page${i}-item${idx}`,
              text: item.str,
              originalText: item.str,
              x: tx[4],
              y: viewport.height - tx[5] - h,
              width: item.width || item.str.length * Math.abs(tx[0]) * 0.5,
              height: h,
              fontSize: Math.abs(tx[0]) || 12,
              fontName,
              detectedFont: detectBestFont(fontName),
              page: i,
              modified: false,
            };
          });

        pagesData.push({
          width: viewport.width,
          height: viewport.height,
          textItems,
        });
      }

      setPages(pagesData);
      setCurrentPage(0);

      // Log detected fonts for debugging
      const fontCounts: Record<string, number> = {};
      for (const page of pagesData) {
        for (const item of page.textItems) {
          if (item.fontName) {
            fontCounts[item.fontName] = (fontCounts[item.fontName] || 0) + 1;
          }
        }
      }
      console.log('Detected fonts in PDF:', fontCounts);
    } catch (err) {
      console.error('PDF load error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load PDF');
    } finally {
      setLoading(false);
    }
  };

  const renderPage = useCallback(async () => {
    if (!pdfDocRef.current || !canvasRef.current || pages.length === 0) return;

    const page = await pdfDocRef.current.getPage(currentPage + 1);
    const viewport = page.getViewport({ scale });
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    if (!context) return;

    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await page.render({
      canvasContext: context,
      viewport,
    }).promise;
  }, [currentPage, scale, pages.length]);

  useEffect(() => {
    renderPage();
  }, [renderPage]);

  const updateTextItem = (id: string, newText: string) => {
    setPages(prev => prev.map((page) => ({
      ...page,
      textItems: page.textItems.map(item =>
        item.id === id
          ? { ...item, text: newText, modified: newText !== item.originalText }
          : item
      ),
    })));
  };

  const updateItemFont = (id: string, newFont: FontName) => {
    setPages(prev => prev.map((page) => ({
      ...page,
      textItems: page.textItems.map(item =>
        item.id === id
          ? { ...item, detectedFont: newFont, modified: true }
          : item
      ),
    })));
  };

  const getModifiedCount = () => {
    return pages.reduce((count, page) =>
      count + page.textItems.filter(item => item.modified).length, 0
    );
  };

  const saveEditedPdf = async () => {
    if (!pdfBytes || !pdfDocRef.current) return;

    setError(null);

    try {
      // Try loading with pdf-lib first
      let pdfDoc: PDFDocument;
      let useImageFallback = false;

      try {
        pdfDoc = await PDFDocument.load(pdfBytes, {
          ignoreEncryption: true,
          updateMetadata: false,
        });
      } catch {
        // If pdf-lib can't parse it, use image-based fallback
        useImageFallback = true;
        pdfDoc = await PDFDocument.create();
      }

      // Embed all fonts we might need (for per-item font support)
      const embeddedFonts: Record<FontName, Awaited<ReturnType<typeof pdfDoc.embedFont>>> = {
        'Helvetica': await pdfDoc.embedFont(StandardFonts.Helvetica),
        'Helvetica-Bold': await pdfDoc.embedFont(StandardFonts.HelveticaBold),
        'Helvetica-Oblique': await pdfDoc.embedFont(StandardFonts.HelveticaOblique),
        'Helvetica-BoldOblique': await pdfDoc.embedFont(StandardFonts.HelveticaBoldOblique),
        'TimesRoman': await pdfDoc.embedFont(StandardFonts.TimesRoman),
        'TimesRoman-Bold': await pdfDoc.embedFont(StandardFonts.TimesRomanBold),
        'TimesRoman-Italic': await pdfDoc.embedFont(StandardFonts.TimesRomanItalic),
        'TimesRoman-BoldItalic': await pdfDoc.embedFont(StandardFonts.TimesRomanBoldItalic),
        'Courier': await pdfDoc.embedFont(StandardFonts.Courier),
        'Courier-Bold': await pdfDoc.embedFont(StandardFonts.CourierBold),
        'Courier-Oblique': await pdfDoc.embedFont(StandardFonts.CourierOblique),
        'Courier-BoldOblique': await pdfDoc.embedFont(StandardFonts.CourierBoldOblique),
      };

      // Helper to get font for an item
      const getFontForItem = (item: TextItem) => embeddedFonts[item.detectedFont];

      if (useImageFallback) {
        // Render each page as image and embed in new PDF
        for (let pageIdx = 0; pageIdx < pdfDocRef.current.numPages; pageIdx++) {
          const srcPage = await pdfDocRef.current.getPage(pageIdx + 1);
          const viewport = srcPage.getViewport({ scale: 2 }); // Higher res

          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext('2d')!;

          await srcPage.render({ canvasContext: ctx, viewport }).promise;

          // Embed as JPEG
          const jpegData = canvas.toDataURL('image/jpeg', 0.92);
          const jpegBytes = Uint8Array.from(atob(jpegData.split(',')[1]), c => c.charCodeAt(0));
          const jpegImage = await pdfDoc.embedJpg(jpegBytes);

          const page = pdfDoc.addPage([pages[pageIdx].width, pages[pageIdx].height]);
          page.drawImage(jpegImage, {
            x: 0,
            y: 0,
            width: pages[pageIdx].width,
            height: pages[pageIdx].height,
          });

          // Draw modified text on top
          const pageData = pages[pageIdx];
          for (const item of pageData.textItems) {
            if (item.modified) {
              page.drawRectangle({
                x: item.x - 2,
                y: pages[pageIdx].height - item.y - item.height - 2,
                width: item.width + 4,
                height: item.height + 4,
                color: rgb(1, 1, 1),
              });
              page.drawText(item.text, {
                x: item.x,
                y: pages[pageIdx].height - item.y - item.height,
                size: item.fontSize,
                font: getFontForItem(item),
                color: rgb(0, 0, 0),
              });
            }
          }
        }
      } else {
        // Normal mode - modify existing PDF
        const pdfPages = pdfDoc.getPages();

        for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
          const pageData = pages[pageIdx];
          const pdfPage = pdfPages[pageIdx];
          const { height } = pdfPage.getSize();

          for (const item of pageData.textItems) {
            if (item.modified) {
              pdfPage.drawRectangle({
                x: item.x - 2,
                y: height - item.y - item.height - 2,
                width: item.width + 4,
                height: item.height + 4,
                color: rgb(1, 1, 1),
              });
              pdfPage.drawText(item.text, {
                x: item.x,
                y: height - item.y - item.height,
                size: item.fontSize,
                font: getFontForItem(item),
                color: rgb(0, 0, 0),
              });
            }
          }
        }
      }

      const modifiedPdfBytes = await pdfDoc.save();
      const blob = new Blob([modifiedPdfBytes as BlobPart], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = fileName.replace('.pdf', '_edited.pdf') || 'edited.pdf';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      setTimeout(() => URL.revokeObjectURL(url), 100);
    } catch (err) {
      console.error('Save error:', err);
      setError(err instanceof Error ? err.message : 'Failed to save PDF');
    }
  };

  const currentPageData = pages[currentPage];

  return (
    <div className="flex h-screen bg-editor-bg">
      {/* Sidebar */}
      <div className="w-80 bg-editor-surface border-r border-editor-border p-4 flex flex-col gap-4">
        <h1 className="text-xl font-bold text-editor-text">PDF Edit</h1>

        {/* File Input */}
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            onChange={handleFileSelect}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full px-4 py-2 bg-editor-accent hover:bg-editor-accent-hover rounded text-white transition-colors text-sm truncate"
          >
            {fileName || 'Select PDF'}
          </button>
        </div>

        {loading && (
          <div className="text-editor-text-dim text-center py-4">Loading PDF...</div>
        )}

        {error && (
          <div className="text-red-400 text-center py-4 text-sm bg-red-900/20 rounded p-2">
            Error: {error}
          </div>
        )}

        {pages.length > 0 && !loading && (
          <>
            {/* Page Navigation */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
                disabled={currentPage === 0}
                className="px-3 py-1 bg-editor-surface-light rounded disabled:opacity-50 text-sm"
              >
                Prev
              </button>
              <span className="text-editor-text-dim text-sm flex-1 text-center">
                {currentPage + 1} / {pages.length}
              </span>
              <button
                onClick={() => setCurrentPage(p => Math.min(pages.length - 1, p + 1))}
                disabled={currentPage >= pages.length - 1}
                className="px-3 py-1 bg-editor-surface-light rounded disabled:opacity-50 text-sm"
              >
                Next
              </button>
            </div>

            {/* Zoom */}
            <div className="flex items-center gap-2">
              <span className="text-editor-text-dim text-sm">Zoom:</span>
              <input
                type="range"
                min="0.5"
                max="3"
                step="0.1"
                value={scale}
                onChange={e => setScale(Number(e.target.value))}
                className="flex-1"
              />
              <span className="text-editor-text text-sm w-12">{Math.round(scale * 100)}%</span>
            </div>


            {/* Text Items List */}
            <div className="flex-1 min-h-0 overflow-y-auto border border-editor-border rounded">
              <div className="p-2 bg-editor-surface-light border-b border-editor-border sticky top-0">
                <span className="text-sm text-editor-text-dim">
                  Text on page ({currentPageData?.textItems.length || 0} items)
                </span>
              </div>
              <div className="divide-y divide-editor-border">
                {currentPageData?.textItems.map((item, idx) => (
                  <div
                    key={item.id}
                    className={`p-2 text-sm cursor-pointer hover:bg-editor-surface-light ${
                      item.modified ? 'bg-yellow-900/20' : ''
                    } ${editingId === item.id ? 'bg-editor-accent/20' : ''}`}
                    onClick={() => setEditingId(item.id)}
                  >
                    <div className="flex items-start gap-2">
                      <span className="text-editor-text-dim text-xs w-6">{idx + 1}</span>
                      <div className="flex-1 min-w-0">
                        {editingId === item.id ? (
                          <input
                            type="text"
                            value={item.text}
                            onChange={e => updateTextItem(item.id, e.target.value)}
                            onBlur={() => setEditingId(null)}
                            onKeyDown={e => e.key === 'Enter' && setEditingId(null)}
                            autoFocus
                            className="w-full bg-editor-bg border border-editor-border rounded px-2 py-1 text-editor-text text-sm"
                          />
                        ) : (
                          <>
                            <span className={`break-words ${item.modified ? 'text-yellow-400' : 'text-editor-text'}`}>
                              {item.text}
                            </span>
                            <div className="flex items-center gap-1 mt-1">
                              <select
                                value={item.detectedFont}
                                onChange={e => {
                                  e.stopPropagation();
                                  updateItemFont(item.id, e.target.value as FontName);
                                }}
                                onClick={e => e.stopPropagation()}
                                className="text-xs bg-editor-bg border border-editor-border rounded px-1 py-0.5 text-editor-text"
                              >
                                {FONT_OPTIONS.map(opt => (
                                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                              </select>
                              <span className="text-xs text-editor-text-dim opacity-60 truncate" title={item.fontName}>
                                ← {item.fontName?.substring(0, 15) || 'unknown'}
                              </span>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Save Button - always visible at bottom */}
            <div className="space-y-2 pt-2 border-t border-editor-border mt-auto shrink-0">
              {getModifiedCount() > 0 && (
                <div className="text-sm text-yellow-400 text-center">
                  {getModifiedCount()} item(s) modified
                </div>
              )}
              <button
                onClick={saveEditedPdf}
                disabled={getModifiedCount() === 0}
                className="w-full px-4 py-3 bg-green-600 hover:bg-green-700 rounded text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Download Edited PDF
              </button>
            </div>
          </>
        )}
      </div>

      {/* PDF Preview */}
      <div className="flex-1 overflow-auto p-4">
        {pages.length > 0 ? (
          <div className="inline-block relative">
            <canvas ref={canvasRef} className="border border-editor-border shadow-lg" />

            {/* Text overlays for visual feedback */}
            {currentPageData?.textItems.map(item => (
              item.modified && (
                <div
                  key={item.id + '-overlay'}
                  className="absolute bg-yellow-400/20 border border-yellow-400/50 pointer-events-none"
                  style={{
                    left: item.x * scale,
                    top: item.y * scale,
                    width: Math.max(item.width * scale, item.text.length * item.fontSize * 0.6 * scale),
                    height: item.height * scale,
                  }}
                />
              )
            ))}
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-editor-text-dim">
            Select a PDF file to start editing
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
