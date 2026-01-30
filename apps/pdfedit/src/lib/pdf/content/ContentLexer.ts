// Content Stream Lexer - Tokenizes content stream operators

export type ContentTokenType =
  | 'number'
  | 'string'
  | 'hexstring'
  | 'name'
  | 'operator'
  | 'array-start'
  | 'array-end';

export interface ContentToken {
  type: ContentTokenType;
  value: string | number | Uint8Array;
  offset: number;
  length: number;
}

const WHITESPACE = new Set([0, 9, 10, 12, 13, 32]);

export class ContentLexer {
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
        // % comment
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
    return (
      WHITESPACE.has(ch) ||
      ch === 40 ||
      ch === 41 || // ( )
      ch === 60 ||
      ch === 62 || // < >
      ch === 91 ||
      ch === 93 || // [ ]
      ch === 47 ||
      ch === 37
    ); // / %
  }

  nextToken(): ContentToken | null {
    this.skipWhitespace();
    if (this.eof) return null;

    const startOffset = this.pos;
    const ch = this.peek();

    // Array
    if (ch === 91) {
      this.pos++;
      return { type: 'array-start', value: '[', offset: startOffset, length: 1 };
    }
    if (ch === 93) {
      this.pos++;
      return { type: 'array-end', value: ']', offset: startOffset, length: 1 };
    }

    // Hex string <...>
    if (ch === 60) {
      return this.readHexString(startOffset);
    }

    // Literal string (...)
    if (ch === 40) {
      return this.readLiteralString(startOffset);
    }

    // Name
    if (ch === 47) {
      return this.readName(startOffset);
    }

    // Number or operator
    return this.readNumberOrOperator(startOffset);
  }

  private readHexString(startOffset: number): ContentToken {
    this.pos++; // skip <
    const bytes: number[] = [];
    let hexChars = '';

    while (this.pos < this.bytes.length) {
      const ch = this.bytes[this.pos];
      if (ch === 62) {
        // >
        this.pos++;
        break;
      }
      if (!WHITESPACE.has(ch)) {
        hexChars += String.fromCharCode(ch);
        if (hexChars.length === 2) {
          bytes.push(parseInt(hexChars, 16));
          hexChars = '';
        }
      }
      this.pos++;
    }

    // Handle trailing nibble
    if (hexChars.length === 1) {
      bytes.push(parseInt(hexChars + '0', 16));
    }

    return {
      type: 'hexstring',
      value: new Uint8Array(bytes),
      offset: startOffset,
      length: this.pos - startOffset,
    };
  }

  private readLiteralString(startOffset: number): ContentToken {
    this.pos++; // skip (
    const bytes: number[] = [];
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
            bytes.push(10);
            break; // n -> LF
          case 114:
            bytes.push(13);
            break; // r -> CR
          case 116:
            bytes.push(9);
            break; // t -> tab
          case 98:
            bytes.push(8);
            break; // b -> backspace
          case 102:
            bytes.push(12);
            break; // f -> form feed
          case 40:
            bytes.push(40);
            break; // (
          case 41:
            bytes.push(41);
            break; // )
          case 92:
            bytes.push(92);
            break; // \
          case 10: // line continuation (LF)
            break;
          case 13: // line continuation (CR or CRLF)
            if (this.peek(1) === 10) this.pos++;
            break;
          default:
            // Octal escape
            if (escaped >= 48 && escaped <= 55) {
              let octal = escaped - 48;
              for (let i = 0; i < 2; i++) {
                const next = this.peek(1);
                if (next >= 48 && next <= 55) {
                  this.pos++;
                  octal = octal * 8 + (next - 48);
                } else {
                  break;
                }
              }
              bytes.push(octal & 0xff);
            } else {
              bytes.push(escaped);
            }
        }
        this.pos++;
      } else if (ch === 40) {
        depth++;
        bytes.push(ch);
        this.pos++;
      } else if (ch === 41) {
        depth--;
        if (depth > 0) bytes.push(ch);
        this.pos++;
      } else {
        bytes.push(ch);
        this.pos++;
      }
    }

    return {
      type: 'string',
      value: new Uint8Array(bytes),
      offset: startOffset,
      length: this.pos - startOffset,
    };
  }

  private readName(startOffset: number): ContentToken {
    this.pos++; // skip /
    let name = '';

    while (this.pos < this.bytes.length) {
      const ch = this.bytes[this.pos];
      if (this.isDelimiter(ch)) break;

      if (ch === 35) {
        // # hex escape
        this.pos++;
        const h1 = this.bytes[this.pos] ?? 0;
        const h2 = this.bytes[this.pos + 1] ?? 0;
        const hex = String.fromCharCode(h1) + String.fromCharCode(h2);
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

  private readNumberOrOperator(startOffset: number): ContentToken {
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
      type: 'operator',
      value: str,
      offset: startOffset,
      length: this.pos - startOffset,
    };
  }
}
