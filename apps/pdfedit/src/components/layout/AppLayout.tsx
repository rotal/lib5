import { useEffect, useRef, useCallback, useState } from 'react';
import { pdfjsLib } from '../../lib/pdfjs-init';
import {
  PDFDocument,
  extractPageText,
  saveDocument,
  type ExtractedPage,
  type TextSpan,
  ContentParser,
  TextReplacer,
} from '../../lib/pdf';
import { usePDFStore, detectBestFont, type TextItem, type PageData } from '../../store';
import { Sidebar } from './Sidebar';
import { PDFCanvas, PageNavigation, TextItemList } from '../pdf';

// Icons
const MenuIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
  </svg>
);

const DocumentIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
  </svg>
);

const DownloadIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
  </svg>
);

// Bottom sheet for mobile text list
interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

function BottomSheet({ isOpen, onClose, children }: BottomSheetProps) {
  if (!isOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 animate-fade-in"
        onClick={onClose}
      />
      <div className="fixed bottom-0 left-0 right-0 z-50 animate-slide-up safe-bottom">
        <div className="bg-surface-900/95 backdrop-blur-xl border-t border-surface-700/50 rounded-t-3xl max-h-[75vh] flex flex-col shadow-glass">
          <div className="py-3 flex justify-center">
            <div className="w-12 h-1.5 bg-surface-600 rounded-full" />
          </div>
          <div className="flex-1 overflow-auto px-1">{children}</div>
        </div>
      </div>
    </>
  );
}

// Store extracted page data for saving
interface ExtractedPageData {
  extracted: ExtractedPage;
  contentBytes: Uint8Array;
  ops: ReturnType<ContentParser['parse']>;
}

export function AppLayout() {
  const {
    pdfBytes,
    setPdfBytes,
    setFileName,
    pages,
    setPages,
    setCurrentPage,
    setLoading,
    setError,
    isMobile,
    setMobile,
    toggleSidebar,
    getModifiedCount,
    loading,
  } = usePDFStore();

  const pdfDocRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  const pdfDocumentRef = useRef<PDFDocument | null>(null);
  const extractedPagesRef = useRef<Map<number, ExtractedPageData>>(new Map());
  const textSpanMapRef = useRef<Map<string, { pageIndex: number; opIndex: number }>>(new Map());

  const [textListOpen, setTextListOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string>('');

  // Detect mobile
  useEffect(() => {
    const checkMobile = () => {
      setMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, [setMobile]);

  // Handle file selection
  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setLoading(true);
      setError(null);
      setFileName(file.name);
      extractedPagesRef.current.clear();
      textSpanMapRef.current.clear();

      try {
        const arrayBuffer = await file.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        // Make a copy for our parser since PDF.js may transfer/detach the buffer
        const bytesCopy = new Uint8Array(bytes);
        setPdfBytes(bytesCopy);

        // Load with PDF.js for rendering (give it the original)
        const loadingTask = pdfjsLib.getDocument({ data: bytes.slice() });
        const pdfDoc = await loadingTask.promise;
        pdfDocRef.current = pdfDoc;

        // Also load with our PDF parser for modification (use the copy)
        const ourDoc = await PDFDocument.load(bytesCopy);
        pdfDocumentRef.current = ourDoc;

        const pagesData: PageData[] = [];

        for (let i = 0; i < pdfDoc.numPages; i++) {
          const page = await pdfDoc.getPage(i + 1);
          const viewport = page.getViewport({ scale: 1 });
          const textContent = await page.getTextContent();

          // Extract text using our parser for modification support
          let extracted: ExtractedPage | null = null;
          try {
            extracted = await extractPageText(ourDoc, i);

            // Store extracted data for later use
            const contentBytes = ourDoc.getPageContents(i);
            if (contentBytes.length > 0) {
              const totalLength = contentBytes.reduce((sum, b) => sum + b.length, 0);
              const combined = new Uint8Array(totalLength);
              let offset = 0;
              for (const b of contentBytes) {
                combined.set(b, offset);
                offset += b.length;
              }

              const contentParser = new ContentParser();
              const ops = contentParser.parse(combined);

              extractedPagesRef.current.set(i, {
                extracted,
                contentBytes: combined,
                ops,
              });
              console.log(`Page ${i}: Extracted ${extracted.textSpans.length} text spans, ${ops.length} ops`);
              console.log(`Page ${i}: Fonts found:`, Array.from(extracted.fonts.keys()));
              if (extracted.textSpans.length > 0) {
                console.log('Our extracted spans (first 5):', extracted.textSpans.slice(0, 5).map(s => ({ text: s.text, x: Math.round(s.x), fontRef: s.fontRef, opIndex: s.opIndex })));
              }
              if (extracted.textSpans.length === 0) {
                console.warn('WARNING: No text spans extracted! Check font decoding.');
              }
            }
          } catch (err) {
            console.warn(`Could not extract text for page ${i}:`, err);
          }

          // Use PDF.js text content for display (more reliable positions)
          const textItems: TextItem[] = (textContent.items as any[])
            .filter((item) => 'str' in item && item.str && item.str.trim() !== '')
            .map((item, idx) => {
              const tx = item.transform;
              const h = item.height || Math.abs(tx[3]) || 12;
              const fontName = item.fontName || '';

              const itemId = `page${i}-item${idx}`;

              // Try to find matching span from our extraction
              if (extracted) {
                // First try exact text match with position tolerance
                let matchingSpan = extracted.textSpans.find(
                  (span) => span.text === item.str && Math.abs(span.x - tx[4]) < 20
                );
                // If no match, try just text match (take first occurrence)
                if (!matchingSpan) {
                  matchingSpan = extracted.textSpans.find(
                    (span) => span.text === item.str
                  );
                }
                if (matchingSpan) {
                  textSpanMapRef.current.set(itemId, {
                    pageIndex: i,
                    opIndex: matchingSpan.opIndex,
                  });
                }
              }

              return {
                id: itemId,
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

        // Log matching stats
        const totalItems = pagesData.reduce((sum, p) => sum + p.textItems.length, 0);
        const matchedItems = textSpanMapRef.current.size;
        console.log(`Text matching: ${matchedItems}/${totalItems} items matched to spans`);

        const fontCounts: Record<string, number> = {};
        for (const pageData of pagesData) {
          for (const item of pageData.textItems) {
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
    },
    [setLoading, setError, setFileName, setPdfBytes, setPages, setCurrentPage]
  );

  // Save edited PDF using direct content stream modification
  const handleSave = useCallback(async () => {
    if (!pdfBytes || !pdfDocumentRef.current) return;

    setSaving(true);
    setError(null);
    setSaveStatus('Analyzing modifications...');

    try {
      // Re-load document for modification (to avoid corrupting cached state)
      // Make a fresh copy of the bytes
      const doc = await PDFDocument.load(new Uint8Array(pdfBytes));

      // Collect all modified items by page
      const modifiedItemsPerPage = new Map<number, TextItem[]>();
      for (const pageData of pages) {
        const modified = pageData.textItems.filter((item) => item.modified);
        if (modified.length > 0) {
          const pageIdx = modified[0].page;
          modifiedItemsPerPage.set(pageIdx, modified);
        }
      }

      console.log('=== SAVE DEBUG ===');
      console.log('Modified items per page:', Array.from(modifiedItemsPerPage.entries()).map(([p, items]) => ({
        page: p,
        items: items.map(i => ({ id: i.id, original: i.originalText, new: i.text }))
      })));
      console.log('textSpanMapRef size:', textSpanMapRef.current.size);
      console.log('extractedPagesRef size:', extractedPagesRef.current.size);

      if (modifiedItemsPerPage.size === 0) {
        setSaveStatus('');
        setSaving(false);
        return;
      }

      const totalPages = modifiedItemsPerPage.size;
      let processedPages = 0;
      const warnings: string[] = [];

      // Process each page with modifications
      for (const [pageIdx, items] of modifiedItemsPerPage) {
        processedPages++;
        setSaveStatus(`Processing page ${processedPages}/${totalPages}...`);

        // Get extracted data for this page
        const extractedData = extractedPagesRef.current.get(pageIdx);
        if (!extractedData) {
          warnings.push(`Page ${pageIdx + 1}: No extracted data available, skipping`);
          continue;
        }

        const { extracted, contentBytes, ops } = extractedData;

        // Build replacements
        const replacements: { span: TextSpan; newText: string }[] = [];

        console.log(`Page ${pageIdx}: Processing ${items.length} modified items`);
        console.log(`Page ${pageIdx}: Available spans:`, extracted.textSpans.length);

        for (const item of items) {
          console.log(`Looking up item: "${item.id}" -> "${item.originalText}"`);
          const spanInfo = textSpanMapRef.current.get(item.id);
          console.log(`  spanInfo:`, spanInfo);
          if (!spanInfo) {
            warnings.push(`"${item.originalText}": Could not find matching span`);
            continue;
          }

          const span = extracted.textSpans.find((s) => s.opIndex === spanInfo.opIndex);
          console.log(`  span found:`, span ? { text: span.text, opIndex: span.opIndex } : null);
          if (!span) {
            warnings.push(`"${item.originalText}": Span not found at index ${spanInfo.opIndex}`);
            continue;
          }

          replacements.push({ span, newText: item.text });
        }

        if (replacements.length === 0) {
          console.log(`Page ${pageIdx}: No replacements to apply`);
          continue;
        }

        console.log(`Page ${pageIdx}: Fonts available:`, Array.from(extracted.fonts.keys()));
        console.log(`Page ${pageIdx}: Applying ${replacements.length} replacements:`,
          replacements.map(r => ({ from: r.span.text, to: r.newText, opIndex: r.span.opIndex, fontRef: r.span.fontRef })));

        // Verify the original content stream contains the text we're trying to replace
        const contentStreamText = new TextDecoder().decode(contentBytes);
        console.log(`Page ${pageIdx}: Content stream length: ${contentBytes.length}`);
        console.log(`Page ${pageIdx}: Content stream (first 500 chars):`, contentStreamText.slice(0, 500));

        // Check if original text appears in content stream
        for (const r of replacements) {
          if (contentStreamText.includes(`(${r.span.text})`)) {
            console.log(`  ✓ Found "(${r.span.text})" in content stream`);
          } else {
            console.warn(`  ✗ Could not find "(${r.span.text})" in content stream - text might be hex encoded or split`);
          }
        }

        // Apply replacements
        const replacer = new TextReplacer();
        const result = replacer.replace(contentBytes, ops, replacements, extracted.fonts);

        console.log(`Page ${pageIdx}: Replacement result:`, {
          success: result.success,
          hasNewBytes: !!result.newStreamBytes,
          newBytesLength: result.newStreamBytes?.length,
          errors: result.errors
        });

        if (result.errors && result.errors.length > 0) {
          warnings.push(...result.errors);
        }

        if (result.success && result.newStreamBytes) {
          // Log the page's content ref before updating
          const pageInfo = doc.pages[pageIdx];
          console.log(`Page ${pageIdx}: contentsRef =`, pageInfo?.contentsRef);

          doc.updatePageContents(pageIdx, result.newStreamBytes);
          console.log(`Page ${pageIdx}: Updated content stream`);

          // Verify the update was recorded
          console.log(`Page ${pageIdx}: Modified objects after update:`, Array.from(doc.getModifiedObjects().keys()));
        }
      }

      // Show summary of what happened
      const summary = [
        `Modified pages: ${modifiedItemsPerPage.size}`,
        `Warnings: ${warnings.length}`,
        warnings.length > 0 ? warnings.join('\n') : 'None'
      ].join('\n');
      console.log('=== SAVE SUMMARY ===\n' + summary);

      if (warnings.length > 0) {
        console.warn('Save warnings:', warnings);
        // Show alert so user can see issues
        alert('Save completed with warnings:\n' + warnings.slice(0, 5).join('\n') + (warnings.length > 5 ? `\n...and ${warnings.length - 5} more` : ''));
      }

      setSaveStatus('Saving PDF...');

      // Verify modifications were applied
      const modifiedObjs = doc.getModifiedObjects();
      console.log('=== VERIFICATION ===');
      console.log('Modified objects count:', modifiedObjs.size);
      for (const [objNum, obj] of modifiedObjs) {
        console.log(`Object ${objNum}:`, obj);
        if (obj && typeof obj === 'object' && 'data' in obj) {
          const stream = obj as { data: Uint8Array };
          console.log(`  Stream data (first 200 chars):`, new TextDecoder().decode(stream.data.slice(0, 200)));
        }
      }

      // Save the modified document
      const outputBytes = saveDocument(doc, false);

      // Log output size
      console.log('Output PDF size:', outputBytes.length, 'bytes');

      // Search for modified text in output to verify it's there
      const outputText = new TextDecoder().decode(outputBytes);
      for (const [pageIdx, items] of modifiedItemsPerPage) {
        for (const item of items) {
          if (outputText.includes(item.text)) {
            console.log(`✓ Found modified text "${item.text}" in output PDF`);
          } else {
            console.warn(`✗ Modified text "${item.text}" NOT FOUND in output PDF!`);
          }
          if (outputText.includes(item.originalText)) {
            console.warn(`! Original text "${item.originalText}" still exists in output PDF`);
          }
        }
      }

      // Create download
      const blob = new Blob([new Uint8Array(outputBytes)], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);

      const fileName = usePDFStore.getState().fileName;
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName.replace('.pdf', '_edited.pdf') || 'edited.pdf';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      setTimeout(() => URL.revokeObjectURL(url), 100);
      setSaveStatus('');
    } catch (err) {
      console.error('Save error:', err);
      setError(err instanceof Error ? err.message : 'Failed to save PDF');
      setSaveStatus('');
    } finally {
      setSaving(false);
    }
  }, [pdfBytes, pages, setError]);

  const modifiedCount = getModifiedCount();

  // Mobile layout
  if (isMobile) {
    return (
      <div className="flex flex-col h-screen bg-surface-950 noise-overlay relative">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-96 bg-accent-500/10 rounded-full blur-3xl pointer-events-none" />

        <header className="relative z-20 h-14 bg-surface-900/80 backdrop-blur-xl border-b border-surface-700/30 flex items-center px-4 gap-3 safe-top">
          <button
            onClick={toggleSidebar}
            className="p-2 -ml-2 text-surface-300 hover:text-surface-100 hover:bg-surface-800/50 rounded-xl transition-colors"
            aria-label="Open menu"
          >
            <MenuIcon />
          </button>

          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent-500 to-accent-600 flex items-center justify-center shadow-button">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <span className="font-semibold text-surface-100 tracking-tight">PDF Studio</span>
          </div>

          {pages.length > 0 && (
            <div className="flex items-center gap-2">
              <PageNavigation compact />
              <button
                onClick={() => setTextListOpen(true)}
                className="relative p-2 text-surface-300 hover:text-surface-100 hover:bg-surface-800/50 rounded-xl transition-colors"
                aria-label="View text items"
              >
                <DocumentIcon />
                {modifiedCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-modified-500 rounded-full text-[10px] font-bold flex items-center justify-center text-surface-950 badge-pulse">
                    {modifiedCount}
                  </span>
                )}
              </button>
            </div>
          )}
        </header>

        <main className="flex-1 relative z-10 overflow-hidden">
          <PDFCanvas pdfDocRef={pdfDocRef} />
        </main>

        {pages.length > 0 && (
          <div className="relative z-20 p-4 bg-surface-900/80 backdrop-blur-xl border-t border-surface-700/30 safe-bottom space-y-2">
            {saveStatus && (
              <div className="text-center text-xs text-surface-400">{saveStatus}</div>
            )}

            <button
              onClick={handleSave}
              disabled={saving || modifiedCount === 0}
              className={`btn w-full py-3.5 ${
                modifiedCount > 0 ? 'btn-success glow-success' : 'btn-secondary'
              }`}
            >
              {saving ? (
                <>
                  <span className="spinner w-4 h-4" />
                  Saving...
                </>
              ) : (
                <>
                  <DownloadIcon />
                  {modifiedCount > 0 ? (
                    <>
                      Download PDF
                      <span className="ml-1 px-2 py-0.5 bg-white/20 rounded-full text-xs">
                        {modifiedCount} change{modifiedCount !== 1 ? 's' : ''}
                      </span>
                    </>
                  ) : (
                    'No changes to save'
                  )}
                </>
              )}
            </button>
          </div>
        )}

        <Sidebar onFileSelect={handleFileSelect} onSave={handleSave} saving={saving} />

        <BottomSheet isOpen={textListOpen} onClose={() => setTextListOpen(false)}>
          <TextItemList compact />
        </BottomSheet>
      </div>
    );
  }

  // Desktop layout
  return (
    <div className="flex h-screen bg-surface-950 noise-overlay relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-accent-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-success-500/5 rounded-full blur-3xl" />
      </div>

      <Sidebar onFileSelect={handleFileSelect} onSave={handleSave} saving={saving} />

      <main className="flex-1 flex flex-col relative z-10 overflow-hidden">
        <header className="h-14 bg-surface-900/50 backdrop-blur-xl border-b border-surface-700/30 flex items-center justify-between px-6">
          <div className="flex items-center gap-4">
            {pages.length > 0 && (
              <>
                <PageNavigation />
                <div className="h-6 w-px bg-surface-700/50" />
              </>
            )}
            {loading && (
              <div className="flex items-center gap-2 text-surface-400 text-sm">
                <span className="spinner w-4 h-4" />
                Loading PDF...
              </div>
            )}
            {saveStatus && !loading && (
              <div className="text-surface-400 text-sm">{saveStatus}</div>
            )}
          </div>

          {pages.length > 0 && (
            <button
              onClick={handleSave}
              disabled={saving || modifiedCount === 0}
              className={`btn ${
                modifiedCount > 0 ? 'btn-success glow-success' : 'btn-secondary'
              }`}
            >
              {saving ? (
                <>
                  <span className="spinner w-4 h-4" />
                  Saving...
                </>
              ) : (
                <>
                  <DownloadIcon />
                  {modifiedCount > 0 ? (
                    <>
                      Download PDF
                      <span className="ml-1 px-2 py-0.5 bg-white/20 rounded-full text-xs font-semibold">
                        {modifiedCount}
                      </span>
                    </>
                  ) : (
                    'Download PDF'
                  )}
                </>
              )}
            </button>
          )}
        </header>

        <div className="flex-1 overflow-hidden">
          <PDFCanvas pdfDocRef={pdfDocRef} />
        </div>
      </main>
    </div>
  );
}
