// PDF Parser - Parses PDF objects from tokens

import { PDFLexer } from './PDFLexer';
import {
  PDFValue,
  PDFName,
  PDFArray,
  PDFDict,
  PDFStream,
  PDFRef,
  XRefEntry,
  XRefTable,
  isDict,
  isRef,
  dictGetNumber,
  dictGetRef,
  dictGetArray,
} from '../types';
import { StreamDecoder } from './StreamDecoder';

export interface IndirectObject {
  objNum: number;
  genNum: number;
  value: PDFValue;
}

export class PDFParser {
  public lexer: PDFLexer;
  private objectCache: Map<string, PDFValue> = new Map();
  public xrefTable: Map<number, XRefEntry> = new Map();
  public trailer: PDFDict | null = null;

  constructor(bytes: Uint8Array) {
    this.lexer = new PDFLexer(bytes);
  }

  parse(): XRefTable {
    try {
      // 1. Find startxref at end of file
      const startxref = this.findStartXRef();
      if (startxref === -1) {
        throw new Error('Cannot find startxref');
      }

      // 2. Parse xref table(s) and trailer(s)
      console.log('PDFParser: startxref at', startxref);
      try {
        this.parseXRefAt(startxref);
      } catch (err) {
        console.warn('PDFParser: parseXRefAt failed, trying fallback search:', err);
        // Some PDFs have incorrect startxref values - try to find xref by searching
        this.tryFallbackXRefSearch();
      }
      console.log('PDFParser: after parseXRefAt, trailer:', this.trailer ? 'exists' : 'null');

      if (!this.trailer) {
        // Last resort: try to find trailer by searching backwards
        console.warn('PDFParser: trailer still null, trying fallback trailer search');
        this.tryFallbackTrailerSearch();
      }

      if (!this.trailer) {
        throw new Error('Cannot find trailer');
      }

      // Ensure trailer has entries
      if (!this.trailer.entries) {
        console.warn('PDFParser: trailer missing entries, creating empty Map');
        this.trailer.entries = new Map();
      }

      return {
        entries: this.xrefTable,
        trailer: this.trailer,
      };
    } catch (err) {
      console.error('PDFParser.parse error:', err);
      throw err;
    }
  }

  private tryFallbackXRefSearch(): void {
    // Search for "xref" keyword in the file
    const xrefBytes = new TextEncoder().encode('xref');
    let pos = this.lexer.find(xrefBytes, true); // search from end

    while (pos !== -1 && !this.trailer) {
      console.log('PDFParser: fallback found xref at', pos);
      try {
        this.parseXRefTable(pos);
        if (this.trailer) return;
      } catch (e) {
        console.warn('PDFParser: fallback xref parse failed at', pos, e);
      }
      // Try to find another xref before this one
      if (pos > 0) {
        this.lexer.position = 0;
        const nextPos = this.lexer.find(xrefBytes, false);
        if (nextPos !== -1 && nextPos < pos) {
          pos = nextPos;
        } else {
          break;
        }
      } else {
        break;
      }
    }
  }

  private tryFallbackTrailerSearch(): void {
    // Search backwards for "trailer" keyword
    const trailerBytes = new TextEncoder().encode('trailer');
    const pos = this.lexer.find(trailerBytes, true);

    if (pos !== -1) {
      console.log('PDFParser: fallback found trailer at', pos);
      this.lexer.position = pos + trailerBytes.length;
      this.lexer.skipWhitespace();
      try {
        const trailerDict = this.parseValue() as PDFDict;
        if (trailerDict && trailerDict.entries) {
          this.trailer = trailerDict;
          console.log('PDFParser: fallback trailer parsed successfully');
        }
      } catch (e) {
        console.warn('PDFParser: fallback trailer parse failed:', e);
      }
    }
  }

  private findStartXRef(): number {
    // Search backwards for "startxref"
    const searchBytes = new TextEncoder().encode('startxref');
    const pos = this.lexer.find(searchBytes, true);
    if (pos === -1) return -1;

    this.lexer.position = pos + searchBytes.length;
    this.lexer.skipWhitespace();

    const token = this.lexer.nextToken();
    if (token?.type === 'number') {
      return token.value as number;
    }
    return -1;
  }

  private parseXRefAt(offset: number): void {
    this.lexer.position = offset;
    this.lexer.skipWhitespace();

    // Check if this is xref table or xref stream
    // Use the position AFTER skipping whitespace, not the original offset
    const currentPos = this.lexer.position;
    const peek = this.lexer.substring(currentPos, currentPos + 4);
    console.log('PDFParser: parseXRefAt offset', offset, 'currentPos', currentPos, 'peek:', JSON.stringify(peek));
    try {
      if (peek === 'xref') {
        console.log('PDFParser: parsing xref table');
        this.parseXRefTable(currentPos);
      } else {
        // Cross-reference stream
        console.log('PDFParser: parsing xref stream');
        this.parseXRefStream(currentPos);
      }
      console.log('PDFParser: after parsing xref, trailer:', this.trailer ? 'exists' : 'null');
    } catch (err) {
      console.error('PDFParser: parseXRefAt failed:', err);
      throw err;
    }
  }

  private parseXRefTable(offset: number): void {
    this.lexer.position = offset;
    this.lexer.nextToken(); // skip 'xref'

    // Parse subsections
    while (true) {
      this.lexer.skipWhitespace();
      const firstToken = this.lexer.nextToken();

      if (!firstToken || firstToken.type === 'keyword') {
        if (firstToken?.value === 'trailer') {
          break;
        }
        this.lexer.position = firstToken?.offset ?? this.lexer.position;
        break;
      }

      if (firstToken.type !== 'number') break;

      const firstObj = firstToken.value as number;
      const countToken = this.lexer.nextToken();
      if (countToken?.type !== 'number') break;
      const count = countToken.value as number;

      // Read entries
      for (let i = 0; i < count; i++) {
        const line = this.lexer.readLine().trim();
        if (line.length < 17) continue;

        const parts = line.split(/\s+/);
        if (parts.length < 3) continue;

        const objOffset = parseInt(parts[0], 10);
        const gen = parseInt(parts[1], 10);
        const inUse = parts[2] === 'n';

        const objNum = firstObj + i;
        if (!this.xrefTable.has(objNum)) {
          this.xrefTable.set(objNum, {
            offset: objOffset,
            generation: gen,
            inUse,
          });
        }
      }
    }

    // Parse trailer dict
    this.lexer.skipWhitespace();
    const trailerDict = this.parseValue() as PDFDict;
    console.log('PDFParser: parseXRefTable trailerDict:', trailerDict ? 'exists' : 'null',
      trailerDict?.entries ? `entries.size=${trailerDict.entries.size}` : 'no entries');

    if (trailerDict && trailerDict.entries) {
      if (!this.trailer) {
        this.trailer = trailerDict;
        console.log('PDFParser: set trailer from trailerDict');
      } else if (this.trailer.entries) {
        // Merge with existing trailer (earlier trailer has priority)
        for (const [key, value] of trailerDict.entries) {
          if (!this.trailer.entries.has(key)) {
            this.trailer.entries.set(key, value);
          }
        }
      }
    } else {
      console.warn('PDFParser: trailerDict missing or has no entries');
    }

    // Follow Prev pointer to previous xref
    if (trailerDict?.entries) {
      const prev = dictGetNumber(trailerDict, 'Prev');
      if (prev !== undefined) {
        this.parseXRefAt(prev);
      }
    }
  }

  private parseXRefStream(offset: number): void {
    this.lexer.position = offset;

    // Parse the stream object
    const obj = this.parseIndirectObject();
    console.log('PDFParser: parseXRefStream obj:', obj ? `objNum=${obj.objNum}` : 'null');
    if (!obj) {
      console.error('PDFParser: parseIndirectObject returned null');
      throw new Error('Invalid xref stream: failed to parse object');
    }
    if (!(obj.value as any).data) {
      console.error('PDFParser: xref stream object has no data, value type:', typeof obj.value);
      throw new Error('Invalid xref stream: no stream data');
    }

    const stream = obj.value as unknown as PDFStream;
    const dict = stream.dict;

    if (!dict) {
      console.error('parseXRefStream: stream has no dict');
      throw new Error('Invalid xref stream: missing dictionary');
    }

    // Ensure dict has entries (create if missing for defensive handling)
    if (!dict.entries) {
      console.warn('parseXRefStream: dict missing entries, creating empty Map');
      dict.entries = new Map();
    }

    // Decode stream
    const data = StreamDecoder.decode(stream);

    // Get W array (field widths)
    const wArray = dictGetArray(dict, 'W');
    if (!wArray) {
      throw new Error('Missing W array in xref stream');
    }
    const w = wArray.items.map((v) => (typeof v === 'number' ? v : 0));

    // Get Index array (subsection definitions)
    const indexArray = dictGetArray(dict, 'Index');
    const size = dictGetNumber(dict, 'Size') ?? 0;
    const index: number[] = indexArray
      ? indexArray.items.map((v) => (typeof v === 'number' ? v : 0))
      : [0, size];

    // Parse entries
    let dataPos = 0;

    for (let i = 0; i < index.length; i += 2) {
      const firstObj = index[i];
      const count = index[i + 1];

      for (let j = 0; j < count; j++) {
        const objNum = firstObj + j;

        // Read fields
        let type = w[0] > 0 ? this.readInt(data, dataPos, w[0]) : 1;
        dataPos += w[0];
        const field2 = w[1] > 0 ? this.readInt(data, dataPos, w[1]) : 0;
        dataPos += w[1];
        const field3 = w[2] > 0 ? this.readInt(data, dataPos, w[2]) : 0;
        dataPos += w[2];

        if (this.xrefTable.has(objNum)) continue;

        switch (type) {
          case 0: // Free object
            this.xrefTable.set(objNum, {
              offset: field2,
              generation: field3,
              inUse: false,
            });
            break;
          case 1: // Normal object
            this.xrefTable.set(objNum, {
              offset: field2,
              generation: field3,
              inUse: true,
            });
            break;
          case 2: // Compressed object in object stream
            this.xrefTable.set(objNum, {
              offset: 0,
              generation: 0,
              inUse: true,
              streamObjNum: field2,
              indexInStream: field3,
            });
            break;
        }
      }
    }

    // Set trailer from stream dict
    if (dict && dict.entries) {
      if (!this.trailer) {
        this.trailer = dict;
      } else if (this.trailer.entries) {
        for (const [key, value] of dict.entries) {
          if (!this.trailer.entries.has(key)) {
            this.trailer.entries.set(key, value);
          }
        }
      }

      // Follow Prev pointer
      const prev = dictGetNumber(dict, 'Prev');
      if (prev !== undefined) {
        this.parseXRefAt(prev);
      }
    }
  }

  private readInt(data: Uint8Array, offset: number, length: number): number {
    let value = 0;
    for (let i = 0; i < length; i++) {
      value = (value << 8) | (data[offset + i] ?? 0);
    }
    return value;
  }

  parseIndirectObject(): IndirectObject | null {
    const objNumToken = this.lexer.nextToken();
    if (objNumToken?.type !== 'number') return null;

    const genNumToken = this.lexer.nextToken();
    if (genNumToken?.type !== 'number') return null;

    const objKeyword = this.lexer.nextToken();
    if (objKeyword?.type !== 'keyword' || objKeyword.value !== 'obj') return null;

    const value = this.parseValue();
    if (value === undefined) return null;

    // Check for stream
    this.lexer.skipWhitespace();
    const pos = this.lexer.position;
    const nextToken = this.lexer.nextToken();

    if (nextToken?.type === 'keyword' && nextToken.value === 'stream') {
      // Skip to stream data
      let ch = this.lexer.peek();
      if (ch === 13) {
        // CR
        this.lexer.advance();
        if (this.lexer.peek() === 10) this.lexer.advance(); // CRLF
      } else if (ch === 10) {
        // LF
        this.lexer.advance();
      }

      // Get stream length
      if (!isDict(value)) {
        throw new Error('Stream must have dictionary');
      }

      let length = dictGetNumber(value, 'Length');
      if (length === undefined) {
        const lengthRef = dictGetRef(value, 'Length');
        if (lengthRef) {
          const lengthObj = this.getObject(lengthRef.objNum);
          if (typeof lengthObj === 'number') {
            length = lengthObj;
          }
        }
      }

      if (length === undefined) {
        throw new Error('Cannot determine stream length');
      }

      const streamData = this.lexer.readBytes(length);

      // Skip endstream
      this.lexer.skipWhitespace();
      this.lexer.nextToken(); // endstream

      const stream: PDFStream = {
        type: 'stream',
        dict: value,
        data: streamData,
      };

      // Skip endobj
      this.lexer.skipWhitespace();
      this.lexer.nextToken();

      return {
        objNum: objNumToken.value as number,
        genNum: genNumToken.value as number,
        value: stream,
      };
    } else if (nextToken?.type === 'keyword' && nextToken.value === 'endobj') {
      // No stream, done
    } else {
      // Put back token
      this.lexer.position = pos;
    }

    return {
      objNum: objNumToken.value as number,
      genNum: genNumToken.value as number,
      value,
    };
  }

  parseValue(): PDFValue | undefined {
    const token = this.lexer.nextToken();
    if (!token) return undefined;

    switch (token.type) {
      case 'number': {
        // Check if this is actually a reference (objNum genNum R)
        const pos = this.lexer.position;
        const genToken = this.lexer.nextToken();
        if (genToken?.type === 'number') {
          const rToken = this.lexer.nextToken();
          if (rToken?.type === 'keyword' && rToken.value === 'R') {
            return {
              type: 'ref',
              objNum: token.value as number,
              genNum: genToken.value as number,
            } as PDFRef;
          }
        }
        this.lexer.position = pos;
        return token.value as number;
      }

      case 'string':
        return token.value as string;

      case 'hexstring':
        return this.hexStringToBytes(token.value as string);

      case 'name':
        return { type: 'name', value: token.value as string } as PDFName;

      case 'keyword':
        if (token.value === 'true') return true;
        if (token.value === 'false') return false;
        if (token.value === 'null') return null;
        // Unknown keyword
        return undefined;

      case 'array-start':
        return this.parseArray();

      case 'dict-start':
        return this.parseDict();

      default:
        return undefined;
    }
  }

  private hexStringToBytes(hex: string): string {
    // Pad with 0 if odd length
    if (hex.length % 2 !== 0) hex += '0';
    let result = '';
    for (let i = 0; i < hex.length; i += 2) {
      result += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
    }
    return result;
  }

  private parseArray(): PDFArray {
    const items: PDFValue[] = [];

    while (true) {
      this.lexer.skipWhitespace();
      const pos = this.lexer.position;
      const token = this.lexer.nextToken();

      if (!token || token.type === 'array-end') {
        break;
      }

      this.lexer.position = pos;
      const value = this.parseValue();
      if (value !== undefined) {
        items.push(value);
      }
    }

    return { type: 'array', items };
  }

  private parseDict(): PDFDict {
    const entries = new Map<string, PDFValue>();

    while (true) {
      this.lexer.skipWhitespace();
      const pos = this.lexer.position;
      const token = this.lexer.nextToken();

      if (!token || token.type === 'dict-end') {
        break;
      }

      if (token.type !== 'name') {
        this.lexer.position = pos;
        break;
      }

      const key = token.value as string;
      const value = this.parseValue();

      if (value !== undefined) {
        entries.set(key, value);
      }
    }

    return { type: 'dict', entries };
  }

  // Get an object by object number
  getObject(objNum: number): PDFValue | undefined {
    const cacheKey = `${objNum}`;
    if (this.objectCache.has(cacheKey)) {
      return this.objectCache.get(cacheKey);
    }

    const entry = this.xrefTable.get(objNum);
    if (!entry || !entry.inUse) {
      return undefined;
    }

    let value: PDFValue | undefined;

    if (entry.streamObjNum !== undefined) {
      // Object is in an object stream
      value = this.getObjectFromStream(entry.streamObjNum, entry.indexInStream!);
    } else {
      this.lexer.position = entry.offset;
      const obj = this.parseIndirectObject();
      value = obj?.value;
    }

    if (value !== undefined) {
      this.objectCache.set(cacheKey, value);
    }
    return value;
  }

  private objectStreamCache: Map<number, PDFValue[]> = new Map();

  private getObjectFromStream(streamObjNum: number, index: number): PDFValue | undefined {
    if (this.objectStreamCache.has(streamObjNum)) {
      return this.objectStreamCache.get(streamObjNum)![index];
    }

    // Get the object stream
    const streamObj = this.getObject(streamObjNum);
    if (!streamObj || !(streamObj as any).data) {
      return undefined;
    }

    const stream = streamObj as PDFStream;
    if (!stream.dict || !stream.dict.entries) {
      console.warn('PDFParser: Object stream missing dict or entries');
      return undefined;
    }
    const n = dictGetNumber(stream.dict, 'N') ?? 0;
    const first = dictGetNumber(stream.dict, 'First') ?? 0;

    // Decode stream
    const data = StreamDecoder.decode(stream);

    // Parse header (object numbers and offsets)
    const headerLexer = new PDFLexer(data.slice(0, first));
    const offsets: { objNum: number; offset: number }[] = [];

    for (let i = 0; i < n; i++) {
      const objNumToken = headerLexer.nextToken();
      const offsetToken = headerLexer.nextToken();
      if (objNumToken?.type === 'number' && offsetToken?.type === 'number') {
        offsets.push({
          objNum: objNumToken.value as number,
          offset: (offsetToken.value as number) + first,
        });
      }
    }

    // Parse all objects
    const objects: PDFValue[] = [];
    const dataLexer = new PDFLexer(data);

    for (let i = 0; i < offsets.length; i++) {
      dataLexer.position = offsets[i].offset;
      const parser = new PDFParser(data);
      parser.lexer.position = offsets[i].offset;
      const value = parser.parseValue();
      objects.push(value ?? null);
    }

    this.objectStreamCache.set(streamObjNum, objects);
    return objects[index];
  }

  // Resolve a reference
  resolve(value: PDFValue): PDFValue {
    if (isRef(value)) {
      return this.getObject(value.objNum) ?? null;
    }
    return value;
  }

  // Get lexer for direct access
  get _lexer(): PDFLexer {
    return this.lexer;
  }
}
