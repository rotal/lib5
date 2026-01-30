// Stream Decoder - Decompresses PDF streams

import pako from 'pako';
import {
  PDFStream,
  PDFDict,
  dictGet,
  dictGetNumber,
  isName,
  isArray,
} from '../types';

export class StreamDecoder {
  static decode(stream: PDFStream): Uint8Array {
    const filter = dictGet(stream.dict, 'Filter');
    const params = dictGet(stream.dict, 'DecodeParms');

    if (!filter) {
      return stream.data;
    }

    // Handle array of filters
    if (isArray(filter)) {
      let data = stream.data;
      const paramArray = params && isArray(params) ? params.items : [];
      for (let i = 0; i < filter.items.length; i++) {
        const f = filter.items[i];
        const p = paramArray[i];
        if (isName(f)) {
          data = this.applyFilter(f.value, data, p as PDFDict | undefined);
        }
      }
      return data;
    }

    // Single filter
    if (isName(filter)) {
      return this.applyFilter(filter.value, stream.data, params as PDFDict | undefined);
    }

    return stream.data;
  }

  private static applyFilter(
    filterName: string,
    data: Uint8Array,
    params?: PDFDict
  ): Uint8Array {
    switch (filterName) {
      case 'FlateDecode':
      case 'Fl':
        return this.decodeFlateDecode(data, params);
      case 'ASCII85Decode':
      case 'A85':
        return this.decodeASCII85(data);
      case 'ASCIIHexDecode':
      case 'AHx':
        return this.decodeASCIIHex(data);
      case 'LZWDecode':
      case 'LZW':
        return this.decodeLZW(data, params);
      case 'RunLengthDecode':
      case 'RL':
        return this.decodeRunLength(data);
      default:
        console.warn(`Unsupported filter: ${filterName}`);
        return data;
    }
  }

  private static decodeFlateDecode(data: Uint8Array, params?: PDFDict): Uint8Array {
    try {
      const inflated = pako.inflate(data);

      // Apply predictor if specified
      if (params) {
        const predictor = dictGetNumber(params, 'Predictor') ?? 1;
        if (predictor > 1) {
          return this.applyPredictor(inflated, params);
        }
      }

      return inflated;
    } catch (e) {
      console.error('FlateDecode error:', e);
      return data;
    }
  }

  private static applyPredictor(data: Uint8Array, params: PDFDict): Uint8Array {
    const predictor = dictGetNumber(params, 'Predictor') ?? 1;
    const columns = dictGetNumber(params, 'Columns') ?? 1;
    const colors = dictGetNumber(params, 'Colors') ?? 1;
    const bitsPerComponent = dictGetNumber(params, 'BitsPerComponent') ?? 8;

    if (predictor === 1) {
      return data;
    }

    // PNG predictors (10-15)
    if (predictor >= 10) {
      return this.applyPNGPredictor(data, columns, colors, bitsPerComponent);
    }

    // TIFF predictor 2
    if (predictor === 2) {
      return this.applyTIFFPredictor(data, columns, colors, bitsPerComponent);
    }

    return data;
  }

  private static applyPNGPredictor(
    data: Uint8Array,
    columns: number,
    colors: number,
    bitsPerComponent: number
  ): Uint8Array {
    const bytesPerPixel = Math.ceil((colors * bitsPerComponent) / 8);
    const rowBytes = Math.ceil((columns * colors * bitsPerComponent) / 8);
    const rows = Math.floor(data.length / (rowBytes + 1));

    const output = new Uint8Array(rows * rowBytes);
    let inputPos = 0;
    let outputPos = 0;

    for (let row = 0; row < rows; row++) {
      const filterType = data[inputPos++];
      const prevRow = row > 0 ? output.slice((row - 1) * rowBytes, row * rowBytes) : null;

      for (let col = 0; col < rowBytes; col++) {
        const raw = data[inputPos++];
        const left = col >= bytesPerPixel ? output[outputPos - bytesPerPixel] : 0;
        const up = prevRow ? prevRow[col] : 0;
        const upLeft =
          prevRow && col >= bytesPerPixel ? prevRow[col - bytesPerPixel] : 0;

        let value: number;
        switch (filterType) {
          case 0: // None
            value = raw;
            break;
          case 1: // Sub
            value = (raw + left) & 0xff;
            break;
          case 2: // Up
            value = (raw + up) & 0xff;
            break;
          case 3: // Average
            value = (raw + Math.floor((left + up) / 2)) & 0xff;
            break;
          case 4: // Paeth
            value = (raw + this.paethPredictor(left, up, upLeft)) & 0xff;
            break;
          default:
            value = raw;
        }
        output[outputPos++] = value;
      }
    }

    return output;
  }

  private static paethPredictor(a: number, b: number, c: number): number {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    if (pa <= pb && pa <= pc) return a;
    if (pb <= pc) return b;
    return c;
  }

  private static applyTIFFPredictor(
    data: Uint8Array,
    columns: number,
    colors: number,
    bitsPerComponent: number
  ): Uint8Array {
    const bytesPerPixel = Math.ceil((colors * bitsPerComponent) / 8);
    const rowBytes = columns * bytesPerPixel;
    const rows = Math.floor(data.length / rowBytes);

    const output = new Uint8Array(data.length);
    for (let row = 0; row < rows; row++) {
      const rowStart = row * rowBytes;
      for (let col = 0; col < rowBytes; col++) {
        const pos = rowStart + col;
        const left = col >= bytesPerPixel ? output[pos - bytesPerPixel] : 0;
        output[pos] = (data[pos] + left) & 0xff;
      }
    }

    return output;
  }

  private static decodeASCII85(data: Uint8Array): Uint8Array {
    const result: number[] = [];
    let tuple = 0;
    let count = 0;

    for (let i = 0; i < data.length; i++) {
      const ch = data[i];

      // Skip whitespace
      if (ch === 32 || ch === 9 || ch === 10 || ch === 13) continue;

      // End of data
      if (ch === 126 && data[i + 1] === 62) break; // ~>

      // z = 0
      if (ch === 122) {
        if (count !== 0) {
          throw new Error('Invalid ASCII85: z in middle of group');
        }
        result.push(0, 0, 0, 0);
        continue;
      }

      // Regular character
      if (ch < 33 || ch > 117) {
        throw new Error(`Invalid ASCII85 character: ${ch}`);
      }

      tuple = tuple * 85 + (ch - 33);
      count++;

      if (count === 5) {
        result.push(
          (tuple >> 24) & 0xff,
          (tuple >> 16) & 0xff,
          (tuple >> 8) & 0xff,
          tuple & 0xff
        );
        tuple = 0;
        count = 0;
      }
    }

    // Handle remaining bytes
    if (count > 0) {
      for (let i = count; i < 5; i++) {
        tuple = tuple * 85 + 84; // Pad with 'u' (84)
      }
      for (let i = 0; i < count - 1; i++) {
        result.push((tuple >> (24 - i * 8)) & 0xff);
      }
    }

    return new Uint8Array(result);
  }

  private static decodeASCIIHex(data: Uint8Array): Uint8Array {
    const result: number[] = [];
    let high: number | null = null;

    for (let i = 0; i < data.length; i++) {
      const ch = data[i];

      // Skip whitespace
      if (ch === 32 || ch === 9 || ch === 10 || ch === 13) continue;

      // End of data
      if (ch === 62) break; // >

      let nibble: number;
      if (ch >= 48 && ch <= 57) {
        nibble = ch - 48; // 0-9
      } else if (ch >= 65 && ch <= 70) {
        nibble = ch - 55; // A-F
      } else if (ch >= 97 && ch <= 102) {
        nibble = ch - 87; // a-f
      } else {
        continue; // Skip invalid characters
      }

      if (high === null) {
        high = nibble;
      } else {
        result.push((high << 4) | nibble);
        high = null;
      }
    }

    // Handle trailing nibble
    if (high !== null) {
      result.push(high << 4);
    }

    return new Uint8Array(result);
  }

  private static decodeLZW(data: Uint8Array, params?: PDFDict): Uint8Array {
    const earlyChange = params ? (dictGetNumber(params, 'EarlyChange') ?? 1) : 1;

    const output: number[] = [];
    let bits = 0;
    let bitBuf = 0;
    let bitPos = 0;
    let codeSize = 9;
    const clearCode = 256;
    const endCode = 257;
    let nextCode = 258;

    const dictionary: Uint8Array[] = [];
    for (let i = 0; i < 256; i++) {
      dictionary[i] = new Uint8Array([i]);
    }

    function readBits(n: number): number {
      while (bits < n) {
        if (bitPos >= data.length) return -1;
        bitBuf = (bitBuf << 8) | data[bitPos++];
        bits += 8;
      }
      bits -= n;
      return (bitBuf >> bits) & ((1 << n) - 1);
    }

    let prevEntry: Uint8Array | null = null;

    while (true) {
      const code = readBits(codeSize);
      if (code === -1 || code === endCode) break;

      if (code === clearCode) {
        codeSize = 9;
        nextCode = 258;
        dictionary.length = 258;
        prevEntry = null;
        continue;
      }

      let entry: Uint8Array;
      if (code < nextCode) {
        entry = dictionary[code];
      } else if (code === nextCode && prevEntry) {
        entry = new Uint8Array(prevEntry.length + 1);
        entry.set(prevEntry);
        entry[prevEntry.length] = prevEntry[0];
      } else {
        throw new Error('Invalid LZW code');
      }

      for (let i = 0; i < entry.length; i++) {
        output.push(entry[i]);
      }

      if (prevEntry) {
        const newEntry = new Uint8Array(prevEntry.length + 1);
        newEntry.set(prevEntry);
        newEntry[prevEntry.length] = entry[0];
        dictionary[nextCode++] = newEntry;

        const threshold = earlyChange ? nextCode : nextCode + 1;
        if (threshold >= 1 << codeSize && codeSize < 12) {
          codeSize++;
        }
      }

      prevEntry = entry;
    }

    const result = new Uint8Array(output.length);
    for (let i = 0; i < output.length; i++) {
      result[i] = output[i];
    }

    // Apply predictor if needed
    if (params) {
      const predictor = dictGetNumber(params, 'Predictor') ?? 1;
      if (predictor > 1) {
        return this.applyPredictor(result, params);
      }
    }

    return result;
  }

  private static decodeRunLength(data: Uint8Array): Uint8Array {
    const output: number[] = [];
    let i = 0;

    while (i < data.length) {
      const len = data[i++];
      if (len === 128) break; // EOD
      if (len < 128) {
        // Copy next len + 1 bytes
        for (let j = 0; j <= len && i < data.length; j++) {
          output.push(data[i++]);
        }
      } else {
        // Repeat next byte 257 - len times
        const repeat = 257 - len;
        const byte = data[i++];
        for (let j = 0; j < repeat; j++) {
          output.push(byte);
        }
      }
    }

    return new Uint8Array(output);
  }

  // Encode stream data
  static encode(data: Uint8Array, filter: string): Uint8Array {
    switch (filter) {
      case 'FlateDecode':
        return pako.deflate(data);
      case 'ASCIIHexDecode':
        return this.encodeASCIIHex(data);
      default:
        console.warn(`Unsupported encode filter: ${filter}`);
        return data;
    }
  }

  private static encodeASCIIHex(data: Uint8Array): Uint8Array {
    const hex = '0123456789ABCDEF';
    const result = new Uint8Array(data.length * 2 + 1);
    for (let i = 0; i < data.length; i++) {
      result[i * 2] = hex.charCodeAt(data[i] >> 4);
      result[i * 2 + 1] = hex.charCodeAt(data[i] & 0xf);
    }
    result[data.length * 2] = 62; // >
    return result;
  }
}
