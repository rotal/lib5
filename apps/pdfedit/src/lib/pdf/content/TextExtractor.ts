// Text Extractor - Extract text spans with positions from content operations

import { ContentOp, PDFArray, TextSpan, isArray, isName } from '../types';
import { GraphicsState } from './GraphicsState';
import {
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
  STATE_SAVE,
  STATE_RESTORE,
  CONCAT_MATRIX,
} from './ContentParser';

export interface TextDecoder {
  decode(bytes: Uint8Array): string;
}

export interface FontMap {
  get(fontRef: string): TextDecoder | undefined;
}

export class TextExtractor {
  extract(
    ops: ContentOp[],
    fonts: FontMap,
    pageIndex: number
  ): TextSpan[] {
    const spans: TextSpan[] = [];
    const gs = new GraphicsState();

    for (let i = 0; i < ops.length; i++) {
      const op = ops[i];

      switch (op.operator) {
        case STATE_SAVE:
          gs.save();
          break;

        case STATE_RESTORE:
          gs.restore();
          break;

        case CONCAT_MATRIX:
          if (op.operands.length >= 6) {
            gs.concatMatrix(
              op.operands[0] as number,
              op.operands[1] as number,
              op.operands[2] as number,
              op.operands[3] as number,
              op.operands[4] as number,
              op.operands[5] as number
            );
          }
          break;

        case TEXT_BEGIN:
          gs.beginText();
          break;

        case TEXT_END:
          // Text object ended
          break;

        case TEXT_FONT:
          if (op.operands.length >= 2) {
            const fontName = isName(op.operands[0])
              ? op.operands[0].value
              : String(op.operands[0]);
            const fontSize = op.operands[1] as number;
            gs.setFont(fontName, fontSize);
          }
          break;

        case TEXT_MATRIX:
          if (op.operands.length >= 6) {
            gs.setTextMatrix(
              op.operands[0] as number,
              op.operands[1] as number,
              op.operands[2] as number,
              op.operands[3] as number,
              op.operands[4] as number,
              op.operands[5] as number
            );
          }
          break;

        case TEXT_MOVE:
          if (op.operands.length >= 2) {
            gs.moveText(op.operands[0] as number, op.operands[1] as number);
          }
          break;

        case TEXT_MOVE_SET:
          if (op.operands.length >= 2) {
            gs.moveTextSetLeading(
              op.operands[0] as number,
              op.operands[1] as number
            );
          }
          break;

        case TEXT_NEWLINE:
          gs.nextLine();
          break;

        case TEXT_LEADING:
          if (op.operands.length >= 1) {
            gs.textState.leading = op.operands[0] as number;
          }
          break;

        case TEXT_CHAR_SPACE:
          if (op.operands.length >= 1) {
            gs.textState.charSpace = op.operands[0] as number;
          }
          break;

        case TEXT_WORD_SPACE:
          if (op.operands.length >= 1) {
            gs.textState.wordSpace = op.operands[0] as number;
          }
          break;

        case TEXT_HORIZ_SCALE:
          if (op.operands.length >= 1) {
            gs.textState.scale = op.operands[0] as number;
          }
          break;

        case TEXT_RISE:
          if (op.operands.length >= 1) {
            gs.textState.rise = op.operands[0] as number;
          }
          break;

        case TEXT_SHOW:
        case TEXT_SHOW_NEWLINE: {
          // Handle newline for ' operator
          if (op.operator === TEXT_SHOW_NEWLINE) {
            gs.nextLine();
          }

          if (op.operands.length >= 1) {
            const operand = op.operands[0];
            if (operand instanceof Uint8Array) {
              const span = this.createSpan(operand, gs, fonts, i, pageIndex);
              if (span) spans.push(span);
            }
          }
          break;
        }

        case TEXT_SHOW_SPACING: {
          // " operator: aw ac string
          gs.nextLine();
          if (op.operands.length >= 3) {
            gs.textState.wordSpace = op.operands[0] as number;
            gs.textState.charSpace = op.operands[1] as number;
            const operand = op.operands[2];
            if (operand instanceof Uint8Array) {
              const span = this.createSpan(operand, gs, fonts, i, pageIndex);
              if (span) spans.push(span);
            }
          }
          break;
        }

        case TEXT_SHOW_ARRAY: {
          // TJ array
          if (op.operands.length >= 1 && isArray(op.operands[0])) {
            const arr = op.operands[0] as PDFArray;
            const span = this.createSpanFromArray(arr, gs, fonts, i, pageIndex);
            if (span) spans.push(span);
          }
          break;
        }
      }
    }

    return spans;
  }

  private createSpan(
    bytes: Uint8Array,
    gs: GraphicsState,
    fonts: FontMap,
    opIndex: number,
    pageIndex: number
  ): TextSpan | null {
    const decoder = fonts.get(gs.textState.font);
    const text = decoder ? decoder.decode(bytes) : this.fallbackDecode(bytes);

    if (!text) return null;

    const pos = gs.getTextPosition();

    const span: TextSpan = {
      text,
      rawOperand: bytes,
      x: pos.x,
      y: pos.y,
      fontSize: gs.getEffectiveFontSize(),
      fontRef: gs.textState.font,
      opIndex,
      pageIndex,
    };

    // Advance text position (simplified - doesn't account for actual glyph widths)
    // A proper implementation would use font widths
    const avgCharWidth = gs.textState.fontSize * 0.5;
    gs.advanceText(text.length * avgCharWidth);

    return span;
  }

  private createSpanFromArray(
    arr: PDFArray,
    gs: GraphicsState,
    fonts: FontMap,
    opIndex: number,
    pageIndex: number
  ): TextSpan | null {
    // Combine all string elements in the TJ array
    const allBytes: number[] = [];
    let totalKerning = 0;

    for (const item of arr.items) {
      if (item instanceof Uint8Array) {
        for (let i = 0; i < item.length; i++) {
          allBytes.push(item[i]);
        }
      } else if (typeof item === 'number') {
        // Negative number = kerning adjustment (move right)
        // Positive number = move left
        totalKerning += item;
      }
    }

    if (allBytes.length === 0) return null;

    const bytes = new Uint8Array(allBytes);
    const decoder = fonts.get(gs.textState.font);
    const text = decoder ? decoder.decode(bytes) : this.fallbackDecode(bytes);

    if (!text) return null;

    const pos = gs.getTextPosition();

    const span: TextSpan = {
      text,
      rawOperand: arr, // Store original array for potential reconstruction
      x: pos.x,
      y: pos.y,
      fontSize: gs.getEffectiveFontSize(),
      fontRef: gs.textState.font,
      opIndex,
      pageIndex,
    };

    // Advance text position
    const avgCharWidth = gs.textState.fontSize * 0.5;
    const kerningAdjust = totalKerning / 1000 * gs.textState.fontSize;
    gs.advanceText(text.length * avgCharWidth - kerningAdjust);

    return span;
  }

  private fallbackDecode(bytes: Uint8Array): string {
    // Simple fallback: treat as Latin-1
    let result = '';
    for (let i = 0; i < bytes.length; i++) {
      result += String.fromCharCode(bytes[i]);
    }
    return result;
  }
}
