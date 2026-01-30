// Stream Encoder - Compress PDF streams

import pako from 'pako';

export class StreamEncoder {
  // Compress data using FlateDecode
  static compress(data: Uint8Array): Uint8Array {
    return pako.deflate(data);
  }

  // Don't compress (for debugging or when compression isn't beneficial)
  static passthrough(data: Uint8Array): Uint8Array {
    return data;
  }
}
