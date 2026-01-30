// Content Stream Parser - Parses content stream into operations

import { ContentLexer, ContentToken } from './ContentLexer';
import { ContentOp, PDFValue, PDFArray, PDFName } from '../types';

export class ContentParser {
  parse(streamBytes: Uint8Array): ContentOp[] {
    const lexer = new ContentLexer(streamBytes);
    const ops: ContentOp[] = [];
    const operands: { value: PDFValue; offset: number; length: number }[] = [];

    while (!lexer.eof) {
      const token = lexer.nextToken();
      if (!token) break;

      if (token.type === 'operator') {
        const opOffset =
          operands.length > 0 ? operands[0].offset : token.offset;
        const opEnd = token.offset + token.length;

        ops.push({
          operator: token.value as string,
          operands: operands.map((o) => o.value),
          byteOffset: opOffset,
          byteLength: opEnd - opOffset,
        });

        operands.length = 0;
      } else {
        // Operand
        const value = this.tokenToValue(token, lexer);
        operands.push({
          value,
          offset: token.offset,
          length: token.length,
        });
      }
    }

    return ops;
  }

  private tokenToValue(token: ContentToken, lexer: ContentLexer): PDFValue {
    switch (token.type) {
      case 'number':
        return token.value as number;
      case 'string':
      case 'hexstring':
        return token.value as Uint8Array;
      case 'name':
        return { type: 'name', value: token.value as string } as PDFName;
      case 'array-start':
        return this.parseArray(lexer);
      default:
        return null;
    }
  }

  private parseArray(lexer: ContentLexer): PDFArray {
    const items: PDFValue[] = [];

    while (!lexer.eof) {
      lexer.skipWhitespace();
      const token = lexer.nextToken();
      if (!token) break;

      if (token.type === 'array-end') {
        break;
      }

      items.push(this.tokenToValue(token, lexer));
    }

    return { type: 'array', items };
  }
}

// Text-related operators
export const TEXT_BEGIN = 'BT';
export const TEXT_END = 'ET';
export const TEXT_FONT = 'Tf';
export const TEXT_MOVE = 'Td';
export const TEXT_MOVE_SET = 'TD';
export const TEXT_MATRIX = 'Tm';
export const TEXT_NEWLINE = 'T*';
export const TEXT_SHOW = 'Tj';
export const TEXT_SHOW_ARRAY = 'TJ';
export const TEXT_SHOW_NEWLINE = "'";
export const TEXT_SHOW_SPACING = '"';
export const TEXT_CHAR_SPACE = 'Tc';
export const TEXT_WORD_SPACE = 'Tw';
export const TEXT_HORIZ_SCALE = 'Tz';
export const TEXT_LEADING = 'TL';
export const TEXT_RISE = 'Ts';
export const TEXT_RENDER = 'Tr';

// Graphics state operators
export const STATE_SAVE = 'q';
export const STATE_RESTORE = 'Q';
export const CONCAT_MATRIX = 'cm';

export const TEXT_OPERATORS = new Set([
  TEXT_BEGIN,
  TEXT_END,
  TEXT_FONT,
  TEXT_MOVE,
  TEXT_MOVE_SET,
  TEXT_MATRIX,
  TEXT_NEWLINE,
  TEXT_SHOW,
  TEXT_SHOW_ARRAY,
  TEXT_SHOW_NEWLINE,
  TEXT_SHOW_SPACING,
  TEXT_CHAR_SPACE,
  TEXT_WORD_SPACE,
  TEXT_HORIZ_SCALE,
  TEXT_LEADING,
  TEXT_RISE,
  TEXT_RENDER,
]);

export const TEXT_SHOWING_OPERATORS = new Set([
  TEXT_SHOW,
  TEXT_SHOW_ARRAY,
  TEXT_SHOW_NEWLINE,
  TEXT_SHOW_SPACING,
]);
