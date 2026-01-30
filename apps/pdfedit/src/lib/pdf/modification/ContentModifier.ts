// Content Modifier - Modify content stream bytes

import { ContentOp } from '../types';
import { encodePDFString, encodePDFHexString } from '../font/TextEncoder';

export interface ByteReplacement {
  offset: number;
  length: number;
  newBytes: Uint8Array;
}

export class ContentModifier {
  // Apply multiple replacements to stream bytes
  // Replacements must be sorted by offset ascending
  applyReplacements(
    streamBytes: Uint8Array,
    replacements: ByteReplacement[]
  ): Uint8Array {
    if (replacements.length === 0) {
      return streamBytes;
    }

    // Sort replacements by offset (ascending)
    const sorted = [...replacements].sort((a, b) => a.offset - b.offset);

    console.log('ContentModifier: Applying', sorted.length, 'replacements');
    for (const r of sorted) {
      const originalBytes = streamBytes.slice(r.offset, r.offset + r.length);
      console.log(`  Replacement at offset ${r.offset}, length ${r.length}:`);
      console.log(`    Original: "${new TextDecoder().decode(originalBytes)}"`);
      console.log(`    New: "${new TextDecoder().decode(r.newBytes)}"`);
    }

    // Calculate new size
    let newSize = streamBytes.length;
    for (const r of sorted) {
      newSize += r.newBytes.length - r.length;
    }

    const result = new Uint8Array(newSize);
    let srcPos = 0;
    let dstPos = 0;

    for (const r of sorted) {
      // Copy bytes before this replacement
      const beforeLen = r.offset - srcPos;
      if (beforeLen > 0) {
        result.set(streamBytes.slice(srcPos, r.offset), dstPos);
        dstPos += beforeLen;
      }

      // Insert replacement bytes
      result.set(r.newBytes, dstPos);
      dstPos += r.newBytes.length;

      // Skip original bytes
      srcPos = r.offset + r.length;
    }

    // Copy remaining bytes after last replacement
    if (srcPos < streamBytes.length) {
      result.set(streamBytes.slice(srcPos), dstPos);
    }

    console.log('ContentModifier: Result size:', result.length, '(was', streamBytes.length, ')');
    return result;
  }

  // Build replacement bytes for a text operation
  buildTextReplacement(
    op: ContentOp,
    newBytes: Uint8Array,
    useHexString: boolean = false
  ): ByteReplacement {
    // Build new operation bytes
    const newOpBytes = this.buildTextOpBytes(
      op.operator,
      newBytes,
      useHexString
    );

    return {
      offset: op.byteOffset,
      length: op.byteLength,
      newBytes: newOpBytes,
    };
  }

  private buildTextOpBytes(
    operator: string,
    textBytes: Uint8Array,
    useHex: boolean
  ): Uint8Array {
    const stringBytes = useHex
      ? encodePDFHexString(textBytes)
      : encodePDFString(textBytes);

    // Format: <string> <operator>
    // e.g., (Hello) Tj or <48656C6C6F> Tj
    const opBytes = new TextEncoder().encode(operator);
    const result = new Uint8Array(stringBytes.length + 1 + opBytes.length);

    result.set(stringBytes, 0);
    result[stringBytes.length] = 32; // space
    result.set(opBytes, stringBytes.length + 1);

    return result;
  }

  // Build TJ array replacement
  buildTJArrayReplacement(
    op: ContentOp,
    newBytes: Uint8Array,
    useHexString: boolean = false
  ): ByteReplacement {
    // Build new TJ array with single string
    const stringBytes = useHexString
      ? encodePDFHexString(newBytes)
      : encodePDFString(newBytes);

    // Format: [<string>] TJ
    const result = new Uint8Array(stringBytes.length + 6);
    result[0] = 91; // [
    result.set(stringBytes, 1);
    result[stringBytes.length + 1] = 93; // ]
    result[stringBytes.length + 2] = 32; // space
    result[stringBytes.length + 3] = 84; // T
    result[stringBytes.length + 4] = 74; // J
    // Leave last byte as 0 (will be whitespace/newline in actual stream)

    return {
      offset: op.byteOffset,
      length: op.byteLength,
      newBytes: result.slice(0, -1), // Remove trailing 0
    };
  }
}
