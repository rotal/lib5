// ToUnicode CMap Parser

export interface CMapRange {
  start: number;
  end: number;
  unicode: number | number[];
}

export interface ParsedCMap {
  codespaceRanges: { start: number; end: number; bytes: number }[];
  bfChars: Map<number, string>;
  bfRanges: CMapRange[];
}

export class ToUnicodeParser {
  parse(data: Uint8Array): ParsedCMap {
    const text = new TextDecoder('latin1').decode(data);
    const result: ParsedCMap = {
      codespaceRanges: [],
      bfChars: new Map(),
      bfRanges: [],
    };

    this.parseCodespaceRanges(text, result);
    this.parseBfChars(text, result);
    this.parseBfRanges(text, result);

    return result;
  }

  private parseCodespaceRanges(text: string, result: ParsedCMap): void {
    const regex = /begincodespacerange\s*([\s\S]*?)endcodespacerange/g;
    let match;

    while ((match = regex.exec(text)) !== null) {
      const content = match[1];
      const rangeRegex = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g;
      let rangeMatch;

      while ((rangeMatch = rangeRegex.exec(content)) !== null) {
        const startHex = rangeMatch[1];
        const endHex = rangeMatch[2];
        result.codespaceRanges.push({
          start: parseInt(startHex, 16),
          end: parseInt(endHex, 16),
          bytes: startHex.length / 2,
        });
      }
    }
  }

  private parseBfChars(text: string, result: ParsedCMap): void {
    const regex = /beginbfchar\s*([\s\S]*?)endbfchar/g;
    let match;

    while ((match = regex.exec(text)) !== null) {
      const content = match[1];
      const charRegex = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g;
      let charMatch;

      while ((charMatch = charRegex.exec(content)) !== null) {
        const code = parseInt(charMatch[1], 16);
        const unicode = this.hexToString(charMatch[2]);
        result.bfChars.set(code, unicode);
      }
    }
  }

  private parseBfRanges(text: string, result: ParsedCMap): void {
    const regex = /beginbfrange\s*([\s\S]*?)endbfrange/g;
    let match;

    while ((match = regex.exec(text)) !== null) {
      const content = match[1];
      // Match either <start> <end> <unicode> or <start> <end> [array]
      const rangeRegex =
        /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*(?:<([0-9A-Fa-f]+)>|\[([\s\S]*?)\])/g;
      let rangeMatch;

      while ((rangeMatch = rangeRegex.exec(content)) !== null) {
        const start = parseInt(rangeMatch[1], 16);
        const end = parseInt(rangeMatch[2], 16);

        if (rangeMatch[3]) {
          // Simple range: <start> <end> <unicode>
          const unicode = parseInt(rangeMatch[3], 16);
          result.bfRanges.push({ start, end, unicode });
        } else if (rangeMatch[4]) {
          // Array form: <start> <end> [<u1> <u2> ...]
          const arrayContent = rangeMatch[4];
          const unicodes: number[] = [];
          const unicodeRegex = /<([0-9A-Fa-f]+)>/g;
          let unicodeMatch;

          while ((unicodeMatch = unicodeRegex.exec(arrayContent)) !== null) {
            unicodes.push(parseInt(unicodeMatch[1], 16));
          }

          result.bfRanges.push({ start, end, unicode: unicodes });
        }
      }
    }
  }

  private hexToString(hex: string): string {
    let result = '';
    // Interpret as UTF-16BE
    for (let i = 0; i < hex.length; i += 4) {
      const chunk = hex.substr(i, 4).padEnd(4, '0');
      const codePoint = parseInt(chunk, 16);
      result += String.fromCodePoint(codePoint);
    }
    return result;
  }

  // Lookup a character code in the parsed CMap
  lookup(cmap: ParsedCMap, code: number): string | null {
    // Check bfChar
    if (cmap.bfChars.has(code)) {
      return cmap.bfChars.get(code)!;
    }

    // Check bfRanges
    for (const range of cmap.bfRanges) {
      if (code >= range.start && code <= range.end) {
        const offset = code - range.start;
        if (Array.isArray(range.unicode)) {
          // Array form
          if (offset < range.unicode.length) {
            return String.fromCodePoint(range.unicode[offset]);
          }
        } else {
          // Simple range
          return String.fromCodePoint(range.unicode + offset);
        }
      }
    }

    return null;
  }
}
