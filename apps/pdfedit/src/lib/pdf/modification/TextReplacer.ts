// Text Replacer - Replace text in content streams

import { ContentOp, TextSpan } from '../types';
import { ContentModifier, ByteReplacement } from './ContentModifier';
import { PDFTextEncoder } from '../font/TextEncoder';
import { FontInfo } from '../font/FontParser';
import { TEXT_SHOW_ARRAY } from '../content/ContentParser';

export interface TextReplacement {
  span: TextSpan;
  newText: string;
}

export interface ReplacementResult {
  success: boolean;
  newStreamBytes?: Uint8Array;
  errors?: string[];
}

export class TextReplacer {
  private modifier = new ContentModifier();

  // Replace text in content stream
  replace(
    streamBytes: Uint8Array,
    ops: ContentOp[],
    replacements: TextReplacement[],
    fonts: Map<string, FontInfo>
  ): ReplacementResult {
    const errors: string[] = [];
    const byteReplacements: ByteReplacement[] = [];

    for (const replacement of replacements) {
      const { span, newText } = replacement;
      const op = ops[span.opIndex];

      console.log(`TextReplacer: Processing replacement "${span.text}" -> "${newText}"`);
      console.log(`  opIndex: ${span.opIndex}, fontRef: ${span.fontRef}`);

      if (!op) {
        errors.push(`Operation not found for span at index ${span.opIndex}`);
        console.log(`  ERROR: Operation not found`);
        continue;
      }

      console.log(`  operator: ${op.operator}, byteOffset: ${op.byteOffset}, byteLength: ${op.byteLength}`);

      // Get font for this span
      const font = fonts.get(span.fontRef);
      if (!font) {
        errors.push(`Font ${span.fontRef} not found for text "${span.text}"`);
        console.log(`  ERROR: Font not found`);
        continue;
      }

      console.log(`  font: baseFont=${font.baseFont}, isCID=${font.isCIDFont}, encoding=${font.encoding}`);
      console.log(`  unicodeToCharCode size: ${font.unicodeToCharCode.size}`);

      // Create encoder
      const encoder = new PDFTextEncoder(font);

      // Check if we can encode the new text
      if (!encoder.canEncode(newText)) {
        const unencodable = encoder.getUnencodableChars(newText);
        errors.push(
          `Cannot encode characters [${unencodable.join(', ')}] with font ${span.fontRef}`
        );
        console.log(`  ERROR: Cannot encode characters [${unencodable.join(', ')}]`);
        continue;
      }

      // Encode new text
      const newBytes = encoder.encode(newText);
      if (!newBytes) {
        errors.push(`Failed to encode "${newText}"`);
        console.log(`  ERROR: Encode returned null`);
        continue;
      }

      console.log(`  Encoded bytes: [${Array.from(newBytes).join(', ')}]`);

      // Determine if we need hex string (for CID fonts or high bytes)
      const useHex = font.isCIDFont || this.hasHighBytes(newBytes);
      console.log(`  useHex: ${useHex}`);

      // Build replacement based on operator type
      let byteReplacement: ByteReplacement;

      if (op.operator === TEXT_SHOW_ARRAY) {
        // TJ array - replace with simplified single string
        byteReplacement = this.modifier.buildTJArrayReplacement(
          op,
          newBytes,
          useHex
        );
      } else {
        // Tj or similar - simple replacement
        byteReplacement = this.modifier.buildTextReplacement(
          op,
          newBytes,
          useHex
        );
      }

      console.log(`  Replacement: offset=${byteReplacement.offset}, length=${byteReplacement.length}, newLen=${byteReplacement.newBytes.length}`);
      byteReplacements.push(byteReplacement);
    }

    if (errors.length > 0 && byteReplacements.length === 0) {
      return { success: false, errors };
    }

    // Apply all replacements
    const newStreamBytes = this.modifier.applyReplacements(
      streamBytes,
      byteReplacements
    );

    return {
      success: true,
      newStreamBytes,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  private hasHighBytes(bytes: Uint8Array): boolean {
    for (let i = 0; i < bytes.length; i++) {
      if (bytes[i] > 127) return true;
    }
    return false;
  }
}

// Convenience function for single replacement
export function replaceText(
  streamBytes: Uint8Array,
  ops: ContentOp[],
  span: TextSpan,
  newText: string,
  fonts: Map<string, FontInfo>
): ReplacementResult {
  const replacer = new TextReplacer();
  return replacer.replace(streamBytes, ops, [{ span, newText }], fonts);
}
