import { create } from 'zustand';

// Font options for PDF editing
export const FONT_OPTIONS = [
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

export type FontName = typeof FONT_OPTIONS[number]['value'];

export interface TextItem {
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

export interface PageData {
  width: number;
  height: number;
  textItems: TextItem[];
}

// Auto-detect best matching standard font from PDF font name
export function detectBestFont(fontName: string): FontName {
  const lower = fontName.toLowerCase();
  const cleaned = lower.replace(/^[a-z]{6}\+/i, '');

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

  const isItalic =
    cleaned.includes('italic') ||
    cleaned.includes('oblique') ||
    cleaned.includes('inclined') ||
    cleaned.includes('-it') ||
    cleaned.endsWith('it') ||
    /[\-_]?i$/i.test(cleaned);

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

  if (isBold && isItalic) return 'Helvetica-BoldOblique';
  if (isBold) return 'Helvetica-Bold';
  if (isItalic) return 'Helvetica-Oblique';
  return 'Helvetica';
}

interface PDFState {
  // File state
  pdfBytes: Uint8Array | null;
  fileName: string;

  // Page state
  pages: PageData[];
  currentPage: number;

  // UI state
  scale: number;
  editingId: string | null;
  loading: boolean;
  error: string | null;
  isMobile: boolean;
  sidebarOpen: boolean;
}

interface PDFActions {
  setPdfBytes: (bytes: Uint8Array | null) => void;
  setFileName: (name: string) => void;
  setPages: (pages: PageData[]) => void;
  setCurrentPage: (page: number) => void;
  setScale: (scale: number) => void;
  setEditingId: (id: string | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setMobile: (isMobile: boolean) => void;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  updateTextItem: (id: string, newText: string) => void;
  updateItemFont: (id: string, newFont: FontName) => void;
  getModifiedCount: () => number;
  reset: () => void;
  nextPage: () => void;
  prevPage: () => void;
}

const initialState: PDFState = {
  pdfBytes: null,
  fileName: '',
  pages: [],
  currentPage: 0,
  scale: 1.5,
  editingId: null,
  loading: false,
  error: null,
  isMobile: false,
  sidebarOpen: true,
};

export const usePDFStore = create<PDFState & PDFActions>((set, get) => ({
  ...initialState,

  setPdfBytes: (bytes) => set({ pdfBytes: bytes }),
  setFileName: (name) => set({ fileName: name }),
  setPages: (pages) => set({ pages }),
  setCurrentPage: (page) => set({ currentPage: page }),
  setScale: (scale) => set({ scale: Math.max(0.5, Math.min(3, scale)) }),
  setEditingId: (id) => set({ editingId: id }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  setMobile: (isMobile) => set({ isMobile, sidebarOpen: !isMobile }),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),

  updateTextItem: (id, newText) => {
    set((state) => ({
      pages: state.pages.map((page) => ({
        ...page,
        textItems: page.textItems.map((item) =>
          item.id === id
            ? { ...item, text: newText, modified: newText !== item.originalText }
            : item
        ),
      })),
    }));
  },

  updateItemFont: (id, newFont) => {
    set((state) => ({
      pages: state.pages.map((page) => ({
        ...page,
        textItems: page.textItems.map((item) =>
          item.id === id
            ? { ...item, detectedFont: newFont, modified: true }
            : item
        ),
      })),
    }));
  },

  getModifiedCount: () => {
    const { pages } = get();
    return pages.reduce(
      (count, page) => count + page.textItems.filter((item) => item.modified).length,
      0
    );
  },

  reset: () => set(initialState),

  nextPage: () => {
    const { currentPage, pages } = get();
    if (currentPage < pages.length - 1) {
      set({ currentPage: currentPage + 1 });
    }
  },

  prevPage: () => {
    const { currentPage } = get();
    if (currentPage > 0) {
      set({ currentPage: currentPage - 1 });
    }
  },
}));
