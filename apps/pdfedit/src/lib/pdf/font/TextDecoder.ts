// Text Decoder - Decode PDF text bytes to Unicode

import { FontInfo } from './FontParser';
import { ToUnicodeParser } from './ToUnicodeParser';

export class PDFTextDecoder {
  private toUnicodeParser = new ToUnicodeParser();

  constructor(private font: FontInfo) {}

  decode(bytes: Uint8Array): string {
    // Use ToUnicode map if available
    if (this.font.toUnicode) {
      return this.decodeWithToUnicode(bytes);
    }

    // CID fonts without ToUnicode
    if (this.font.isCIDFont) {
      return this.decodeCID(bytes);
    }

    // Simple font with encoding
    return this.decodeSimple(bytes);
  }

  private decodeWithToUnicode(bytes: Uint8Array): string {
    if (!this.font.toUnicode) return this.fallbackDecode(bytes);

    const cmap = this.font.toUnicode;
    let result = '';

    // Determine bytes per character from codespace ranges
    const bytesPerChar = cmap.codespaceRanges.length > 0
      ? cmap.codespaceRanges[0].bytes
      : 1;

    if (bytesPerChar === 2) {
      // Two-byte encoding
      for (let i = 0; i < bytes.length - 1; i += 2) {
        const code = (bytes[i] << 8) | bytes[i + 1];
        const unicode = this.toUnicodeParser.lookup(cmap, code);
        if (unicode) {
          result += unicode;
        } else {
          result += '\uFFFD'; // Replacement character
        }
      }
    } else {
      // One-byte encoding
      for (let i = 0; i < bytes.length; i++) {
        const code = bytes[i];
        const unicode = this.toUnicodeParser.lookup(cmap, code);
        if (unicode) {
          result += unicode;
        } else {
          // Fall back to charCodeToUnicode map
          const fromMap = this.font.charCodeToUnicode.get(code);
          if (fromMap) {
            result += fromMap;
          } else {
            result += String.fromCharCode(code);
          }
        }
      }
    }

    return result;
  }

  private decodeCID(bytes: Uint8Array): string {
    // CID fonts typically use 2-byte encoding
    let result = '';

    for (let i = 0; i < bytes.length - 1; i += 2) {
      const code = (bytes[i] << 8) | bytes[i + 1];

      // Try charCodeToUnicode map
      const unicode = this.font.charCodeToUnicode.get(code);
      if (unicode) {
        result += unicode;
      } else {
        // Without ToUnicode, we can't reliably decode CID fonts
        result += '\uFFFD';
      }
    }

    return result;
  }

  private decodeSimple(bytes: Uint8Array): string {
    let result = '';

    for (let i = 0; i < bytes.length; i++) {
      const code = bytes[i];
      const unicode = this.font.charCodeToUnicode.get(code);

      if (unicode) {
        result += unicode;
      } else {
        // Fallback to Latin-1
        result += String.fromCharCode(code);
      }
    }

    return result;
  }

  private fallbackDecode(bytes: Uint8Array): string {
    // Simple fallback: treat as Latin-1
    let result = '';
    for (let i = 0; i < bytes.length; i++) {
      result += String.fromCharCode(bytes[i]);
    }
    return result;
  }
}

// Simple wrapper interface for TextExtractor
export function createTextDecoder(font: FontInfo): {
  decode: (bytes: Uint8Array) => string;
} {
  const decoder = new PDFTextDecoder(font);
  return {
    decode: (bytes: Uint8Array) => decoder.decode(bytes),
  };
}
