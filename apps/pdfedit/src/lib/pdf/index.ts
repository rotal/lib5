// PDF Library - Direct PDF text modification without MuPDF

// Core types
export * from './types';

// Parser
export { PDFDocument, type PageInfo } from './parser';

// Content parsing
export {
  ContentParser,
  TextExtractor,
  type TextDecoder,
  type FontMap,
} from './content';

// Font handling
export {
  FontParser,
  type FontInfo,
  PDFTextDecoder,
  PDFTextEncoder,
  createTextDecoder,
  createTextEncoder,
  canEncodeWinAnsi,
} from './font';

// Modification
export {
  TextReplacer,
  replaceText,
  type TextReplacement,
  type ReplacementResult,
} from './modification';

// Writer
export { PDFWriter, type WriteOptions } from './writer';

// High-level API
import { PDFDocument } from './parser';
import { ContentParser, TextExtractor, type FontMap } from './content';
import { FontParser, type FontInfo, createTextDecoder } from './font';
import { TextReplacer, type TextReplacement, type ReplacementResult } from './modification';
import { PDFWriter } from './writer';
import { TextSpan } from './types';

export interface ExtractedPage {
  pageIndex: number;
  width: number;
  height: number;
  textSpans: TextSpan[];
  fonts: Map<string, FontInfo>;
}

export interface ModifyTextOptions {
  pageIndex: number;
  opIndex: number;
  newText: string;
}

// Extract text from a page
export async function extractPageText(
  doc: PDFDocument,
  pageIndex: number
): Promise<ExtractedPage> {
  const page = doc.pages[pageIndex];
  if (!page) {
    throw new Error(`Page ${pageIndex} not found`);
  }

  // Get content streams
  const contentBytes = doc.getPageContents(pageIndex);
  if (contentBytes.length === 0) {
    return {
      pageIndex,
      width: page.width,
      height: page.height,
      textSpans: [],
      fonts: new Map(),
    };
  }

  // Combine content streams
  const totalLength = contentBytes.reduce((sum, b) => sum + b.length, 0);
  const combined = new Uint8Array(totalLength);
  let offset = 0;
  for (const bytes of contentBytes) {
    combined.set(bytes, offset);
    offset += bytes.length;
  }

  // Parse content operations
  const contentParser = new ContentParser();
  const ops = contentParser.parse(combined);

  // Parse fonts
  const fontDicts = doc.getPageFonts(pageIndex);
  const fontParser = new FontParser((v) => doc.resolve(v));
  const fonts = new Map<string, FontInfo>();

  for (const [name, dict] of fontDicts) {
    fonts.set(name, fontParser.parse(dict, name));
  }

  // Create font map for text extraction
  const fontMap: FontMap = {
    get: (fontRef: string) => {
      const font = fonts.get(fontRef);
      if (!font) return undefined;
      return createTextDecoder(font);
    },
  };

  // Extract text
  const extractor = new TextExtractor();
  const textSpans = extractor.extract(ops, fontMap, pageIndex);

  return {
    pageIndex,
    width: page.width,
    height: page.height,
    textSpans,
    fonts,
  };
}

// Modify text and get new PDF bytes
export async function modifyText(
  doc: PDFDocument,
  modifications: ModifyTextOptions[]
): Promise<ReplacementResult[]> {
  const results: ReplacementResult[] = [];

  // Group modifications by page
  const byPage = new Map<number, ModifyTextOptions[]>();
  for (const mod of modifications) {
    const arr = byPage.get(mod.pageIndex) || [];
    arr.push(mod);
    byPage.set(mod.pageIndex, arr);
  }

  // Process each page
  for (const [pageIndex, mods] of byPage) {
    const extracted = await extractPageText(doc, pageIndex);

    // Get original content stream
    const contentBytes = doc.getPageContents(pageIndex);
    if (contentBytes.length === 0) {
      results.push({ success: false, errors: ['No content stream'] });
      continue;
    }

    // Combine content streams
    const totalLength = contentBytes.reduce((sum, b) => sum + b.length, 0);
    const combined = new Uint8Array(totalLength);
    let offset = 0;
    for (const bytes of contentBytes) {
      combined.set(bytes, offset);
      offset += bytes.length;
    }

    // Parse operations
    const contentParser = new ContentParser();
    const ops = contentParser.parse(combined);

    // Build replacements
    const replacements: TextReplacement[] = [];
    for (const mod of mods) {
      const span = extracted.textSpans.find((s) => s.opIndex === mod.opIndex);
      if (span) {
        replacements.push({ span, newText: mod.newText });
      }
    }

    // Apply replacements
    const replacer = new TextReplacer();
    const result = replacer.replace(
      combined,
      ops,
      replacements,
      extracted.fonts
    );

    results.push(result);

    // Update document if successful
    if (result.success && result.newStreamBytes) {
      doc.updatePageContents(pageIndex, result.newStreamBytes);
    }
  }

  return results;
}

// Save document to bytes
export function saveDocument(doc: PDFDocument, compress: boolean = false): Uint8Array {
  const writer = new PDFWriter();
  return writer.writeDocument(doc, { compress });
}
