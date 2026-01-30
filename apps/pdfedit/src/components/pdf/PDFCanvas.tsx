import { useRef, useEffect, useCallback } from 'react';
import { pdfjsLib } from '../../lib/pdfjs-init';
import { usePDFStore } from '../../store';
import { usePDFViewport } from '../../hooks';

// Icons
const UploadIcon = () => (
  <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
);

// Map font names to CSS font families
const fontToCss: Record<string, string> = {
  'Helvetica': 'Helvetica, Arial, sans-serif',
  'Helvetica-Bold': 'Helvetica, Arial, sans-serif',
  'Helvetica-Oblique': 'Helvetica, Arial, sans-serif',
  'Helvetica-BoldOblique': 'Helvetica, Arial, sans-serif',
  'TimesRoman': 'Times New Roman, Times, serif',
  'TimesRoman-Bold': 'Times New Roman, Times, serif',
  'TimesRoman-Italic': 'Times New Roman, Times, serif',
  'TimesRoman-BoldItalic': 'Times New Roman, Times, serif',
  'Courier': 'Courier New, Courier, monospace',
  'Courier-Bold': 'Courier New, Courier, monospace',
  'Courier-Oblique': 'Courier New, Courier, monospace',
  'Courier-BoldOblique': 'Courier New, Courier, monospace',
};

const isBoldFont = (font: string) => font.includes('Bold');
const isItalicFont = (font: string) => font.includes('Oblique') || font.includes('Italic');

interface PDFCanvasProps {
  pdfDocRef: React.MutableRefObject<pdfjsLib.PDFDocumentProxy | null>;
}

export function PDFCanvas({ pdfDocRef }: PDFCanvasProps) {
  const { pages, currentPage, scale, isMobile, editingId } = usePDFStore();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const {
    containerRef,
    panOffset,
    handlers,
  } = usePDFViewport();

  const currentPageData = pages[currentPage];

  // Render the current page
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
  }, [currentPage, scale, pages.length, pdfDocRef]);

  useEffect(() => {
    renderPage();
  }, [renderPage]);

  if (pages.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center animate-fade-in">
          <div className="w-24 h-24 mx-auto mb-6 rounded-3xl bg-surface-800/30 border border-surface-700/30 flex items-center justify-center">
            <UploadIcon />
          </div>
          <h2 className="text-xl font-semibold text-surface-200 mb-2">
            No PDF Selected
          </h2>
          <p className="text-surface-500 text-sm max-w-xs mx-auto">
            Select a PDF file from the sidebar to start editing text content
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-auto flex items-start justify-center p-4 md:p-8"
      style={{ touchAction: isMobile ? 'none' : 'auto' }}
      {...handlers}
    >
      <div
        className="relative animate-scale-in"
        style={{
          transform: `translate(${panOffset.x}px, ${panOffset.y}px)`,
        }}
      >
        {/* PDF Canvas with shadow and border */}
        <div className="relative rounded-lg overflow-hidden shadow-glass">
          {/* Checkerboard pattern background (for transparency) */}
          <div
            className="absolute inset-0 opacity-5"
            style={{
              backgroundImage: `linear-gradient(45deg, #334155 25%, transparent 25%),
                               linear-gradient(-45deg, #334155 25%, transparent 25%),
                               linear-gradient(45deg, transparent 75%, #334155 75%),
                               linear-gradient(-45deg, transparent 75%, #334155 75%)`,
              backgroundSize: '20px 20px',
              backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px',
            }}
          />

          <canvas
            ref={canvasRef}
            className="relative block"
            style={{ background: 'white' }}
          />

          {/* Live text preview overlays for modified or currently editing items */}
          {currentPageData?.textItems.map(
            (item) =>
              (item.modified || item.id === editingId) && (
                <div
                  key={item.id + '-preview'}
                  className="absolute pointer-events-none"
                  style={{
                    left: item.x * scale,
                    top: item.y * scale,
                    // White background to cover original text
                    backgroundColor: 'white',
                    padding: '0 2px',
                  }}
                >
                  {/* The edited text with matching font */}
                  <span
                    style={{
                      fontFamily: fontToCss[item.detectedFont] || 'sans-serif',
                      fontSize: `${item.fontSize * scale}px`,
                      fontWeight: isBoldFont(item.detectedFont) ? 'bold' : 'normal',
                      fontStyle: isItalicFont(item.detectedFont) ? 'italic' : 'normal',
                      color: item.id === editingId ? '#1d4ed8' : 'black',
                      whiteSpace: 'nowrap',
                      lineHeight: 1,
                      display: 'block',
                    }}
                  >
                    {item.text}
                  </span>
                </div>
              )
          )}

          {/* Highlight for currently editing item */}
          {editingId && currentPageData?.textItems.map(
            (item) =>
              item.id === editingId && (
                <div
                  key={item.id + '-editing'}
                  className="absolute pointer-events-none rounded animate-pulse"
                  style={{
                    left: item.x * scale - 4,
                    top: item.y * scale - 4,
                    width: Math.max(
                      item.width * scale,
                      item.text.length * item.fontSize * 0.6 * scale
                    ) + 8,
                    height: item.height * scale + 8,
                    border: '3px solid rgba(59, 130, 246, 0.8)',
                    boxShadow: '0 0 20px rgba(59, 130, 246, 0.5), inset 0 0 10px rgba(59, 130, 246, 0.1)',
                    borderRadius: '4px',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                  }}
                />
              )
          )}
        </div>

        {/* Highlight overlays for modified items (but not if currently editing) */}
        {currentPageData?.textItems.map(
          (item) =>
            item.modified && item.id !== editingId && (
              <div
                key={item.id + '-highlight'}
                className="absolute pointer-events-none rounded-sm"
                style={{
                  left: item.x * scale - 2,
                  top: item.y * scale - 2,
                  width: Math.max(
                    item.width * scale,
                    item.text.length * item.fontSize * 0.6 * scale
                  ) + 4,
                  height: item.height * scale + 4,
                  border: '2px solid rgba(249, 115, 22, 0.6)',
                  boxShadow: '0 0 12px rgba(249, 115, 22, 0.3)',
                  borderRadius: '2px',
                }}
              />
            )
        )}
      </div>
    </div>
  );
}
