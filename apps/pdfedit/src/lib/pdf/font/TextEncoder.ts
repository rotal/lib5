// Text Encoder - Encode Unicode text to PDF bytes

import { FontInfo } from './FontParser';
import { WIN_ANSI_ENCODING } from './Encoding';

export class PDFTextEncoder {
  constructor(private font: FontInfo) {}

  // Check if text can be encoded with this font
  canEncode(text: string): boolean {
    for (const char of text) {
      if (!this.getCharCode(char)) {
        return false;
      }
    }
    return true;
  }

  // Encode text to bytes
  encode(text: string): Uint8Array | null {
    const codes: number[] = [];

    for (const char of text) {
      const code = this.getCharCode(char);
      if (code === null) {
        return null; // Cannot encode this character
      }

      if (this.font.isCIDFont) {
        // Two-byte encoding
        codes.push((code >> 8) & 0xff);
        codes.push(code & 0xff);
      } else {
        codes.push(code);
      }
    }

    return new Uint8Array(codes);
  }

  private getCharCode(char: string): number | null {
    // Try direct lookup first
    const direct = this.font.unicodeToCharCode.get(char);
    if (direct !== undefined) {
      return direct;
    }

    // For simple fonts, try WinAnsi encoding
    if (!this.font.isCIDFont) {
      const charCode = char.charCodeAt(0);

      // ASCII range is usually direct
      if (charCode >= 0x20 && charCode <= 0x7e) {
        return charCode;
      }

      // Check WinAnsi extended
      for (let i = 0x80; i <= 0xff; i++) {
        if (WIN_ANSI_ENCODING[i] === char) {
          return i;
        }
      }
    }

    return null;
  }

  // Get list of characters that cannot be encoded
  getUnencodableChars(text: string): string[] {
    const unencodable: string[] = [];

    for (const char of text) {
      if (!this.getCharCode(char) && !unencodable.includes(char)) {
        unencodable.push(char);
      }
    }

    return unencodable;
  }
}

// Create encoder for a font
export function createTextEncoder(font: FontInfo): PDFTextEncoder {
  return new PDFTextEncoder(font);
}

// Utility: Check if text can be encoded with WinAnsi (standard fonts)
export function canEncodeWinAnsi(text: string): boolean {
  for (const char of text) {
    const code = char.charCodeAt(0);

    // ASCII printable
    if (code >= 0x20 && code <= 0x7e) continue;

    // Latin-1 supplement
    if (code >= 0xa0 && code <= 0xff) continue;

    // Check WinAnsi extended characters
    let found = false;
    for (let i = 0x80; i < 0xa0; i++) {
      if (WIN_ANSI_ENCODING[i] === char) {
        found = true;
        break;
      }
    }
    if (!found) return false;
  }

  return true;
}

// Encode string for PDF literal string (parentheses)
export function encodePDFString(bytes: Uint8Array): Uint8Array {
  const result: number[] = [];
  result.push(40); // (

  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];

    // Escape special characters
    switch (b) {
      case 40: // (
        result.push(92, 40); // \(
        break;
      case 41: // )
        result.push(92, 41); // \)
        break;
      case 92: // \
        result.push(92, 92); // \\
        break;
      case 10: // LF
        result.push(92, 110); // \n
        break;
      case 13: // CR
        result.push(92, 114); // \r
        break;
      default:
        result.push(b);
    }
  }

  result.push(41); // )
  return new Uint8Array(result);
}

// Encode bytes as PDF hex string
export function encodePDFHexString(bytes: Uint8Array): Uint8Array {
  const hex = '0123456789ABCDEF';
  const result = new Uint8Array(bytes.length * 2 + 2);

  result[0] = 60; // <

  for (let i = 0; i < bytes.length; i++) {
    result[i * 2 + 1] = hex.charCodeAt(bytes[i] >> 4);
    result[i * 2 + 2] = hex.charCodeAt(bytes[i] & 0xf);
  }

  result[bytes.length * 2 + 1] = 62; // >
  return result;
}
