// Graphics State - Track transformation matrix and text state

export interface Matrix {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

export interface TextState {
  charSpace: number;
  wordSpace: number;
  scale: number;
  leading: number;
  font: string;
  fontSize: number;
  rise: number;
  renderMode: number;
}

export interface GraphicsStateSnapshot {
  ctm: Matrix;
  textState: TextState;
}

export class GraphicsState {
  // Current transformation matrix
  ctm: Matrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

  // Text state
  textState: TextState = {
    charSpace: 0,
    wordSpace: 0,
    scale: 100,
    leading: 0,
    font: '',
    fontSize: 12,
    rise: 0,
    renderMode: 0,
  };

  // Text matrix (set by Tm, modified by Td/TD/T*)
  textMatrix: Matrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

  // Text line matrix (for T* and TD)
  textLineMatrix: Matrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

  // Stack for q/Q
  private stateStack: GraphicsStateSnapshot[] = [];

  save(): void {
    this.stateStack.push({
      ctm: { ...this.ctm },
      textState: { ...this.textState },
    });
  }

  restore(): void {
    const state = this.stateStack.pop();
    if (state) {
      this.ctm = state.ctm;
      this.textState = state.textState;
    }
  }

  // Concatenate matrix (cm operator)
  concatMatrix(a: number, b: number, c: number, d: number, e: number, f: number): void {
    const m = this.ctm;
    this.ctm = {
      a: a * m.a + b * m.c,
      b: a * m.b + b * m.d,
      c: c * m.a + d * m.c,
      d: c * m.b + d * m.d,
      e: e * m.a + f * m.c + m.e,
      f: e * m.b + f * m.d + m.f,
    };
  }

  // Begin text object (BT)
  beginText(): void {
    this.textMatrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
    this.textLineMatrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  }

  // Set text matrix (Tm)
  setTextMatrix(a: number, b: number, c: number, d: number, e: number, f: number): void {
    this.textMatrix = { a, b, c, d, e, f };
    this.textLineMatrix = { a, b, c, d, e, f };
  }

  // Move text position (Td)
  moveText(tx: number, ty: number): void {
    const lm = this.textLineMatrix;
    const e = tx * lm.a + ty * lm.c + lm.e;
    const f = tx * lm.b + ty * lm.d + lm.f;
    this.textLineMatrix = { ...lm, e, f };
    this.textMatrix = { ...this.textLineMatrix };
  }

  // Move text position and set leading (TD)
  moveTextSetLeading(tx: number, ty: number): void {
    this.textState.leading = -ty;
    this.moveText(tx, ty);
  }

  // Move to next line (T*)
  nextLine(): void {
    this.moveText(0, -this.textState.leading);
  }

  // Set font (Tf)
  setFont(font: string, size: number): void {
    this.textState.font = font;
    this.textState.fontSize = size;
  }

  // Get current text position in user space
  getTextPosition(): { x: number; y: number } {
    // Transform text matrix origin by CTM
    const tm = this.textMatrix;
    const ctm = this.ctm;

    const x = tm.e * ctm.a + tm.f * ctm.c + ctm.e;
    const y = tm.e * ctm.b + tm.f * ctm.d + ctm.f;

    return { x, y };
  }

  // Get effective font size (considering CTM and text matrix scaling)
  getEffectiveFontSize(): number {
    const tm = this.textMatrix;
    const ctm = this.ctm;

    // Font size is scaled by text matrix and CTM
    const sx = Math.sqrt(tm.a * tm.a + tm.b * tm.b);
    const ctmScale = Math.sqrt(ctm.a * ctm.a + ctm.b * ctm.b);

    return this.textState.fontSize * sx * ctmScale;
  }

  // Update text matrix after showing text
  // width is the width of the text in user space units
  advanceText(width: number): void {
    const scale = this.textState.scale / 100;
    const tx = width * scale;

    const tm = this.textMatrix;
    this.textMatrix = {
      ...tm,
      e: tm.e + tx * tm.a,
      f: tm.f + tx * tm.b,
    };
  }

  clone(): GraphicsState {
    const gs = new GraphicsState();
    gs.ctm = { ...this.ctm };
    gs.textState = { ...this.textState };
    gs.textMatrix = { ...this.textMatrix };
    gs.textLineMatrix = { ...this.textLineMatrix };
    return gs;
  }
}

// Multiply two matrices
export function multiplyMatrix(m1: Matrix, m2: Matrix): Matrix {
  return {
    a: m1.a * m2.a + m1.b * m2.c,
    b: m1.a * m2.b + m1.b * m2.d,
    c: m1.c * m2.a + m1.d * m2.c,
    d: m1.c * m2.b + m1.d * m2.d,
    e: m1.e * m2.a + m1.f * m2.c + m2.e,
    f: m1.e * m2.b + m1.f * m2.d + m2.f,
  };
}

// Transform point by matrix
export function transformPoint(m: Matrix, x: number, y: number): { x: number; y: number } {
  return {
    x: x * m.a + y * m.c + m.e,
    y: x * m.b + y * m.d + m.f,
  };
}
