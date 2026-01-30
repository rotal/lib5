// PDF Writer - Serialize PDF to bytes

import {
  PDFValue,
  PDFDict,
  PDFArray,
  PDFStream,
  isDict,
  isArray,
  isStream,
  isRef,
  isName,
} from '../types';
import { PDFDocument } from '../parser/PDFDocument';
import { StreamEncoder } from './StreamEncoder';

export interface WriteOptions {
  compress?: boolean;
}

export class PDFWriter {
  private chunks: Uint8Array[] = [];
  private currentOffset: number = 0;
  private xref: Map<number, number> = new Map();
  private encoder = new TextEncoder();

  writeDocument(doc: PDFDocument, options: WriteOptions = {}): Uint8Array {
    this.chunks = [];
    this.currentOffset = 0;
    this.xref = new Map();

    const { compress = false } = options;

    // 1. Write header
    this.writeHeader(doc.version);

    // 2. Write binary marker (helps identify as binary)
    this.writeLine('%\x80\x81\x82\x83');

    // 3. Write all objects
    const modifiedObjects = doc.getModifiedObjects();
    console.log('PDFWriter: Modified objects:', Array.from(modifiedObjects.keys()));

    const allObjNums = new Set<number>();

    // Collect all object numbers from xref
    for (const objNum of doc._parser.xrefTable.keys()) {
      allObjNums.add(objNum);
    }

    // Add modified object numbers
    for (const objNum of modifiedObjects.keys()) {
      allObjNums.add(objNum);
    }

    // Sort object numbers for consistent output
    const sortedObjNums = Array.from(allObjNums).sort((a, b) => a - b);
    console.log('PDFWriter: Total objects to write:', sortedObjNums.length);

    for (const objNum of sortedObjNums) {
      const entry = doc._parser.xrefTable.get(objNum);

      // Skip free objects
      if (entry && !entry.inUse) continue;

      // Get object value (modified or original)
      let value: PDFValue | undefined;
      const isModified = modifiedObjects.has(objNum);
      if (isModified) {
        value = modifiedObjects.get(objNum);
        const valueType = value && typeof value === 'object' && 'type' in value ? value.type : typeof value;
        console.log(`PDFWriter: Writing MODIFIED object ${objNum}, type:`, valueType);
        if (value && isStream(value)) {
          console.log(`PDFWriter: Modified stream length: ${value.data.length}, first 50 bytes:`,
            new TextDecoder().decode(value.data.slice(0, 50)));
        }
      } else {
        value = doc.getObject(objNum);
      }

      if (value === undefined) continue;

      // Record offset
      this.xref.set(objNum, this.currentOffset);

      // Get generation number
      const genNum = entry?.generation ?? 0;

      // Write object
      this.writeIndirectObject(objNum, genNum, value, compress);
    }

    // 4. Write xref table
    const xrefOffset = this.currentOffset;
    this.writeXRef(sortedObjNums);

    // 5. Write trailer
    this.writeTrailer(doc, xrefOffset);

    // Concatenate all chunks
    return this.concat();
  }

  private writeHeader(version: string): void {
    this.writeLine(`%PDF-${version}`);
  }

  private writeIndirectObject(
    objNum: number,
    genNum: number,
    value: PDFValue,
    compress: boolean
  ): void {
    this.writeLine(`${objNum} ${genNum} obj`);

    if (isStream(value)) {
      this.writeStream(value, compress);
    } else {
      this.writeValue(value);
      this.write('\n');
    }

    this.writeLine('endobj');
    this.write('\n');
  }

  private writeValue(value: PDFValue): void {
    if (value === null) {
      this.write('null');
    } else if (typeof value === 'boolean') {
      this.write(value ? 'true' : 'false');
    } else if (typeof value === 'number') {
      // Format number (avoid scientific notation, limit decimals)
      const str = this.formatNumber(value);
      this.write(str);
    } else if (typeof value === 'string') {
      // String (literal)
      this.writeLiteralString(value);
    } else if (value instanceof Uint8Array) {
      // Raw bytes as hex string
      this.writeHexString(value);
    } else if (isName(value)) {
      this.write('/');
      this.writeName(value.value);
    } else if (isRef(value)) {
      this.write(`${value.objNum} ${value.genNum} R`);
    } else if (isArray(value)) {
      this.writeArray(value);
    } else if (isDict(value)) {
      this.writeDict(value);
    }
  }

  private formatNumber(num: number): string {
    if (Number.isInteger(num)) {
      return num.toString();
    }

    // Limit decimal places and remove trailing zeros
    let str = num.toFixed(6);
    str = str.replace(/\.?0+$/, '');
    return str || '0';
  }

  private writeLiteralString(str: string): void {
    this.write('(');
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      switch (ch) {
        case 40: // (
          this.write('\\(');
          break;
        case 41: // )
          this.write('\\)');
          break;
        case 92: // \
          this.write('\\\\');
          break;
        case 10: // LF
          this.write('\\n');
          break;
        case 13: // CR
          this.write('\\r');
          break;
        default:
          if (ch < 32 || ch > 126) {
            // Octal escape for non-printable
            this.write('\\' + ch.toString(8).padStart(3, '0'));
          } else {
            this.write(String.fromCharCode(ch));
          }
      }
    }
    this.write(')');
  }

  private writeHexString(bytes: Uint8Array): void {
    const hex = '0123456789ABCDEF';
    this.write('<');
    for (let i = 0; i < bytes.length; i++) {
      this.write(hex[bytes[i] >> 4]);
      this.write(hex[bytes[i] & 0xf]);
    }
    this.write('>');
  }

  private writeName(name: string): void {
    for (let i = 0; i < name.length; i++) {
      const ch = name.charCodeAt(i);
      // Escape special characters with # hex
      if (ch < 33 || ch > 126 || ch === 35 || ch === 47) {
        // # 0-9 or /
        this.write('#');
        this.write(ch.toString(16).padStart(2, '0').toUpperCase());
      } else {
        this.write(String.fromCharCode(ch));
      }
    }
  }

  private writeArray(arr: PDFArray): void {
    this.write('[');
    for (let i = 0; i < arr.items.length; i++) {
      if (i > 0) this.write(' ');
      this.writeValue(arr.items[i]);
    }
    this.write(']');
  }

  private writeDict(dict: PDFDict): void {
    this.write('<<');
    for (const [key, value] of dict.entries) {
      this.write('/');
      this.writeName(key);
      this.write(' ');
      this.writeValue(value);
      this.write(' ');
    }
    this.write('>>');
  }

  private writeStream(stream: PDFStream, compress: boolean): void {
    let data = stream.data;
    const dict = new Map(stream.dict.entries);

    // Optionally compress
    if (compress && !dict.has('Filter')) {
      data = StreamEncoder.compress(data);
      dict.set('Filter', { type: 'name', value: 'FlateDecode' });
    }

    // Update length
    dict.set('Length', data.length);

    // Write dictionary
    this.writeDict({ type: 'dict', entries: dict });
    this.write('\nstream\n');

    // Write stream data
    this.writeBytes(data);

    this.write('\nendstream');
  }

  private writeXRef(objNums: number[]): void {
    this.writeLine('xref');

    // Find contiguous subsections
    const subsections: { start: number; entries: { offset: number; gen: number; inUse: boolean }[] }[] =
      [];
    let currentSubsection: { start: number; entries: { offset: number; gen: number; inUse: boolean }[] } | null =
      null;

    // Always include object 0 (free head)
    const allObjNums = [0, ...objNums.filter((n) => n !== 0)];

    for (let i = 0; i < allObjNums.length; i++) {
      const objNum = allObjNums[i];
      const offset = this.xref.get(objNum);

      const entry = {
        offset: offset ?? 0,
        gen: objNum === 0 ? 65535 : 0,
        inUse: objNum !== 0 && offset !== undefined,
      };

      if (
        currentSubsection === null ||
        objNum !== currentSubsection.start + currentSubsection.entries.length
      ) {
        // Start new subsection
        currentSubsection = { start: objNum, entries: [entry] };
        subsections.push(currentSubsection);
      } else {
        currentSubsection.entries.push(entry);
      }
    }

    // Write subsections
    for (const sub of subsections) {
      this.writeLine(`${sub.start} ${sub.entries.length}`);
      for (const entry of sub.entries) {
        const offsetStr = entry.offset.toString().padStart(10, '0');
        const genStr = entry.gen.toString().padStart(5, '0');
        const flag = entry.inUse ? 'n' : 'f';
        this.writeLine(`${offsetStr} ${genStr} ${flag} `);
      }
    }
  }

  private writeTrailer(doc: PDFDocument, xrefOffset: number): void {
    this.writeLine('trailer');

    // Build trailer dict
    const trailer = doc.trailer;
    if (!trailer) {
      throw new Error('No trailer in document');
    }

    // Create new trailer dict with updated values
    const newTrailer: PDFDict = {
      type: 'dict',
      entries: new Map(trailer.entries),
    };

    // Update Size to be max object number + 1
    let maxObjNum = 0;
    for (const objNum of this.xref.keys()) {
      if (objNum > maxObjNum) maxObjNum = objNum;
    }
    newTrailer.entries.set('Size', maxObjNum + 1);

    // Remove Prev (we're writing complete xref)
    newTrailer.entries.delete('Prev');

    this.writeDict(newTrailer);
    this.write('\n');

    this.writeLine('startxref');
    this.writeLine(xrefOffset.toString());
    this.write('%%EOF\n');
  }

  private write(str: string): void {
    const bytes = this.encoder.encode(str);
    this.writeBytes(bytes);
  }

  private writeLine(str: string): void {
    this.write(str + '\n');
  }

  private writeBytes(bytes: Uint8Array): void {
    this.chunks.push(bytes);
    this.currentOffset += bytes.length;
  }

  private concat(): Uint8Array {
    const totalLength = this.chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;

    for (const chunk of this.chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }

    return result;
  }
}
