// PDF Lexer - Tokenizes PDF bytes into tokens

export type TokenType =
  | 'number'
  | 'string'
  | 'hexstring'
  | 'name'
  | 'keyword'
  | 'array-start'
  | 'array-end'
  | 'dict-start'
  | 'dict-end';

export interface Token {
  type: TokenType;
  value: string | number;
  offset: number;
  length: number;
}

// Whitespace characters in PDF
const WHITESPACE = new Set([0, 9, 10, 12, 13, 32]); // null, tab, LF, FF, CR, space
// Delimiter characters
const DELIMITERS = new Set([
  40, 41, 60, 62, 91, 93, 123, 125, 47, 37, // ( ) < > [ ] { } / %
]);

export class PDFLexer {
  private pos: number = 0;

  constructor(private bytes: Uint8Array) {}

  get position(): number {
    return this.pos;
  }

  set position(pos: number) {
    this.pos = pos;
  }

  get eof(): boolean {
    return this.pos >= this.bytes.length;
  }

  peek(offset: number = 0): number {
    return this.bytes[this.pos + offset] ?? -1;
  }

  advance(): number {
    return this.bytes[this.pos++] ?? -1;
  }

  skipWhitespace(): void {
    while (this.pos < this.bytes.length) {
      const ch = this.bytes[this.pos];
      if (WHITESPACE.has(ch)) {
        this.pos++;
      } else if (ch === 37) {
        // % comment - skip to end of line
        this.pos++;
        while (this.pos < this.bytes.length) {
          const c = this.bytes[this.pos];
          if (c === 10 || c === 13) break;
          this.pos++;
        }
      } else {
        break;
      }
    }
  }

  isWhitespace(ch: number): boolean {
    return WHITESPACE.has(ch);
  }

  isDelimiter(ch: number): boolean {
    return DELIMITERS.has(ch) || WHITESPACE.has(ch);
  }

  nextToken(): Token | null {
    this.skipWhitespace();
    if (this.eof) return null;

    const startOffset = this.pos;
    const ch = this.peek();

    // Dict start <<
    if (ch === 60 && this.peek(1) === 60) {
      this.pos += 2;
      return { type: 'dict-start', value: '<<', offset: startOffset, length: 2 };
    }

    // Dict end >>
    if (ch === 62 && this.peek(1) === 62) {
      this.pos += 2;
      return { type: 'dict-end', value: '>>', offset: startOffset, length: 2 };
    }

    // Hex string <...>
    if (ch === 60) {
      return this.readHexString(startOffset);
    }

    // Literal string (...)
    if (ch === 40) {
      return this.readLiteralString(startOffset);
    }

    // Array
    if (ch === 91) {
      this.pos++;
      return { type: 'array-start', value: '[', offset: startOffset, length: 1 };
    }
    if (ch === 93) {
      this.pos++;
      return { type: 'array-end', value: ']', offset: startOffset, length: 1 };
    }

    // Name
    if (ch === 47) {
      return this.readName(startOffset);
    }

    // Number or keyword
    return this.readNumberOrKeyword(startOffset);
  }

  private readHexString(startOffset: number): Token {
    this.pos++; // skip <
    let hex = '';
    while (this.pos < this.bytes.length) {
      const ch = this.bytes[this.pos];
      if (ch === 62) {
        // >
        this.pos++;
        break;
      }
      if (!WHITESPACE.has(ch)) {
        hex += String.fromCharCode(ch);
      }
      this.pos++;
    }
    return {
      type: 'hexstring',
      value: hex,
      offset: startOffset,
      length: this.pos - startOffset,
    };
  }

  private readLiteralString(startOffset: number): Token {
    this.pos++; // skip (
    let str = '';
    let depth = 1;

    while (this.pos < this.bytes.length && depth > 0) {
      const ch = this.bytes[this.pos];

      if (ch === 92) {
        // backslash escape
        this.pos++;
        if (this.pos >= this.bytes.length) break;
        const escaped = this.bytes[this.pos];
        switch (escaped) {
          case 110:
            str += '\n';
            break; // n
          case 114:
            str += '\r';
            break; // r
          case 116:
            str += '\t';
            break; // t
          case 98:
            str += '\b';
            break; // b
          case 102:
            str += '\f';
            break; // f
          case 40:
            str += '(';
            break;
          case 41:
            str += ')';
            break;
          case 92:
            str += '\\';
            break;
          case 10: // line continuation (LF)
            break;
          case 13: // line continuation (CR or CRLF)
            if (this.peek(1) === 10) this.pos++;
            break;
          default:
            // Octal escape
            if (escaped >= 48 && escaped <= 55) {
              let octal = String.fromCharCode(escaped);
              for (let i = 0; i < 2 && this.peek(1) >= 48 && this.peek(1) <= 55; i++) {
                this.pos++;
                octal += String.fromCharCode(this.bytes[this.pos]);
              }
              str += String.fromCharCode(parseInt(octal, 8));
            } else {
              str += String.fromCharCode(escaped);
            }
        }
        this.pos++;
      } else if (ch === 40) {
        depth++;
        str += '(';
        this.pos++;
      } else if (ch === 41) {
        depth--;
        if (depth > 0) str += ')';
        this.pos++;
      } else {
        str += String.fromCharCode(ch);
        this.pos++;
      }
    }

    return {
      type: 'string',
      value: str,
      offset: startOffset,
      length: this.pos - startOffset,
    };
  }

  private readName(startOffset: number): Token {
    this.pos++; // skip /
    let name = '';

    while (this.pos < this.bytes.length) {
      const ch = this.bytes[this.pos];
      if (this.isDelimiter(ch)) break;

      if (ch === 35) {
        // # hex escape
        this.pos++;
        const hex =
          String.fromCharCode(this.bytes[this.pos] ?? 0) +
          String.fromCharCode(this.bytes[this.pos + 1] ?? 0);
        name += String.fromCharCode(parseInt(hex, 16));
        this.pos += 2;
      } else {
        name += String.fromCharCode(ch);
        this.pos++;
      }
    }

    return {
      type: 'name',
      value: name,
      offset: startOffset,
      length: this.pos - startOffset,
    };
  }

  private readNumberOrKeyword(startOffset: number): Token {
    let str = '';

    while (this.pos < this.bytes.length) {
      const ch = this.bytes[this.pos];
      if (this.isDelimiter(ch)) break;
      str += String.fromCharCode(ch);
      this.pos++;
    }

    // Try to parse as number
    const num = parseFloat(str);
    if (!isNaN(num) && isFinite(num)) {
      return {
        type: 'number',
        value: num,
        offset: startOffset,
        length: this.pos - startOffset,
      };
    }

    return {
      type: 'keyword',
      value: str,
      offset: startOffset,
      length: this.pos - startOffset,
    };
  }

  // Read raw bytes (for stream data)
  readBytes(length: number): Uint8Array {
    const data = this.bytes.slice(this.pos, this.pos + length);
    this.pos += length;
    return data;
  }

  // Find byte sequence
  find(sequence: Uint8Array, fromEnd: boolean = false): number {
    if (fromEnd) {
      for (let i = this.bytes.length - sequence.length; i >= 0; i--) {
        let match = true;
        for (let j = 0; j < sequence.length; j++) {
          if (this.bytes[i + j] !== sequence[j]) {
            match = false;
            break;
          }
        }
        if (match) return i;
      }
    } else {
      for (let i = this.pos; i <= this.bytes.length - sequence.length; i++) {
        let match = true;
        for (let j = 0; j < sequence.length; j++) {
          if (this.bytes[i + j] !== sequence[j]) {
            match = false;
            break;
          }
        }
        if (match) return i;
      }
    }
    return -1;
  }

  // Read a line from current position
  readLine(): string {
    let line = '';
    while (this.pos < this.bytes.length) {
      const ch = this.bytes[this.pos];
      this.pos++;
      if (ch === 10) break; // LF
      if (ch === 13) {
        // CR
        if (this.peek() === 10) this.pos++; // CRLF
        break;
      }
      line += String.fromCharCode(ch);
    }
    return line;
  }

  // Get substring of bytes as string
  substring(start: number, end: number): string {
    let str = '';
    for (let i = start; i < end && i < this.bytes.length; i++) {
      str += String.fromCharCode(this.bytes[i]);
    }
    return str;
  }
}
