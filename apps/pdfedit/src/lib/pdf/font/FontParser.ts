// Font Parser - Parse PDF font dictionaries

import {
  PDFDict,
  PDFValue,
  isDict,
  isStream,
  isName,
  dictGet,
  dictGetName,
  dictGetNumber,
  dictGetArray,
  dictGetDict,
} from '../types';
import { StreamDecoder } from '../parser/StreamDecoder';
import { ToUnicodeParser, ParsedCMap } from './ToUnicodeParser';
import {
  getEncodingByName,
  GLYPH_TO_UNICODE,
} from './Encoding';

export interface FontInfo {
  ref: string;
  subtype: string;
  baseFont?: string;
  encoding?: string;
  toUnicode?: ParsedCMap;
  firstChar?: number;
  lastChar?: number;
  widths?: number[];
  charCodeToUnicode: Map<number, string>;
  unicodeToCharCode: Map<string, number>;
  isCIDFont: boolean;
  descendantFonts?: PDFDict[];
}

export class FontParser {
  private toUnicodeParser = new ToUnicodeParser();

  constructor(private resolve: (value: PDFValue) => PDFValue) {}

  parse(fontDict: PDFDict, fontRef: string): FontInfo {
    const subtype = dictGetName(fontDict, 'Subtype') ?? 'Type1';
    const baseFont = dictGetName(fontDict, 'BaseFont');

    const info: FontInfo = {
      ref: fontRef,
      subtype,
      baseFont,
      charCodeToUnicode: new Map(),
      unicodeToCharCode: new Map(),
      isCIDFont: subtype === 'Type0',
    };

    // Parse ToUnicode map
    const toUnicodeRef = dictGet(fontDict, 'ToUnicode');
    if (toUnicodeRef) {
      const toUnicodeStream = this.resolve(toUnicodeRef);
      if (isStream(toUnicodeStream)) {
        const data = StreamDecoder.decode(toUnicodeStream);
        info.toUnicode = this.toUnicodeParser.parse(data);
      }
    }

    // Handle CID fonts (Type0)
    if (subtype === 'Type0') {
      this.parseCIDFont(fontDict, info);
    } else {
      // Simple fonts (Type1, TrueType, etc.)
      this.parseSimpleFont(fontDict, info);
    }

    // Build unicode mapping
    this.buildUnicodeMap(info);

    return info;
  }

  private parseCIDFont(fontDict: PDFDict, info: FontInfo): void {
    const descendantFonts = dictGetArray(fontDict, 'DescendantFonts');
    if (!descendantFonts) return;

    info.descendantFonts = [];

    for (const dfRef of descendantFonts.items) {
      const df = this.resolve(dfRef);
      if (isDict(df)) {
        info.descendantFonts.push(df);

        // Get encoding from CIDSystemInfo if available
        const cidSystemInfo = dictGetDict(df, 'CIDSystemInfo');
        // Could extract more info from cidSystemInfo if needed
        void cidSystemInfo;

        // Get widths (could store for width calculations if needed)
        // const dw = dictGetNumber(df, 'DW');
        // const w = dictGetArray(df, 'W');
      }
    }

    // Encoding for Type0 is a CMap name or stream
    const encoding = dictGet(fontDict, 'Encoding');
    if (encoding && isName(encoding)) {
      info.encoding = encoding.value;
    }
  }

  private parseSimpleFont(fontDict: PDFDict, info: FontInfo): void {
    // Get encoding
    const encoding = dictGet(fontDict, 'Encoding');

    if (encoding && isName(encoding)) {
      info.encoding = encoding.value;
    } else if (encoding && isDict(encoding)) {
      // Custom encoding with Differences array
      const baseEncoding = dictGetName(encoding, 'BaseEncoding');
      info.encoding = baseEncoding ?? 'StandardEncoding';

      // Parse Differences array
      const differences = dictGetArray(encoding, 'Differences');
      if (differences) {
        this.parseDifferences(differences, info);
      }
    }

    // Get character range
    info.firstChar = dictGetNumber(fontDict, 'FirstChar');
    info.lastChar = dictGetNumber(fontDict, 'LastChar');

    // Get widths
    const widths = dictGetArray(fontDict, 'Widths');
    if (widths) {
      info.widths = widths.items.map((v) =>
        typeof v === 'number' ? v : 0
      );
    }
  }

  private parseDifferences(
    differences: { type: 'array'; items: PDFValue[] },
    info: FontInfo
  ): void {
    let currentCode = 0;

    for (const item of differences.items) {
      if (typeof item === 'number') {
        currentCode = item;
      } else if (isName(item)) {
        // Map glyph name to unicode
        const unicode = GLYPH_TO_UNICODE.get(item.value);
        if (unicode) {
          info.charCodeToUnicode.set(currentCode, unicode);
          info.unicodeToCharCode.set(unicode, currentCode);
        }
        currentCode++;
      }
    }
  }

  private buildUnicodeMap(info: FontInfo): void {
    // If we have ToUnicode, it takes priority
    if (info.toUnicode) {
      // ToUnicode will be used during decoding
      // But we should still build reverse mapping for encoding
      for (const [code, unicode] of info.toUnicode.bfChars) {
        info.charCodeToUnicode.set(code, unicode);
        // Only add to reverse if not already present (prefer lower codes)
        if (!info.unicodeToCharCode.has(unicode)) {
          info.unicodeToCharCode.set(unicode, code);
        }
      }

      // Process ranges
      for (const range of info.toUnicode.bfRanges) {
        for (let code = range.start; code <= range.end; code++) {
          const offset = code - range.start;
          let unicode: string;

          if (Array.isArray(range.unicode)) {
            if (offset < range.unicode.length) {
              unicode = String.fromCodePoint(range.unicode[offset]);
            } else {
              continue;
            }
          } else {
            unicode = String.fromCodePoint(range.unicode + offset);
          }

          info.charCodeToUnicode.set(code, unicode);
          if (!info.unicodeToCharCode.has(unicode)) {
            info.unicodeToCharCode.set(unicode, code);
          }
        }
      }
    }

    // Fill in from standard encoding if not a CID font
    if (!info.isCIDFont && info.charCodeToUnicode.size === 0) {
      const encoding = getEncodingByName(info.encoding ?? 'WinAnsiEncoding');

      const first = info.firstChar ?? 0;
      const last = info.lastChar ?? 255;

      for (let code = first; code <= last; code++) {
        const char = encoding[code];
        if (char && !info.charCodeToUnicode.has(code)) {
          // For standard encodings, the value might be a glyph name
          let unicode = char;
          if (char.length > 1 && char !== '\uFB01' && char !== '\uFB02') {
            // Looks like a glyph name
            const mapped = GLYPH_TO_UNICODE.get(char);
            if (mapped) {
              unicode = mapped;
            }
          }
          info.charCodeToUnicode.set(code, unicode);
          if (!info.unicodeToCharCode.has(unicode)) {
            info.unicodeToCharCode.set(unicode, code);
          }
        }
      }
    }
  }
}
