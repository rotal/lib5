// PDF Core Types

export interface PDFName {
  type: 'name';
  value: string;
}

export interface PDFArray {
  type: 'array';
  items: PDFValue[];
}

export interface PDFDict {
  type: 'dict';
  entries: Map<string, PDFValue>;
}

export interface PDFStream {
  type: 'stream';
  dict: PDFDict;
  data: Uint8Array;
}

export interface PDFRef {
  type: 'ref';
  objNum: number;
  genNum: number;
}

export type PDFValue =
  | number
  | string
  | boolean
  | null
  | Uint8Array
  | PDFName
  | PDFArray
  | PDFDict
  | PDFStream
  | PDFRef;

export interface XRefEntry {
  offset: number;
  generation: number;
  inUse: boolean;
  // For compressed objects (object streams)
  streamObjNum?: number;
  indexInStream?: number;
}

export interface XRefTable {
  entries: Map<number, XRefEntry>;
  trailer: PDFDict;
}

// Content stream types
export interface ContentOp {
  operator: string;
  operands: PDFValue[];
  byteOffset: number;
  byteLength: number;
}

// Text extraction types
export interface TextSpan {
  text: string;
  rawOperand: PDFValue;
  x: number;
  y: number;
  fontSize: number;
  fontRef: string;
  opIndex: number;
  pageIndex: number;
}

// Font types
export interface ParsedFont {
  ref: string;
  subtype: string;
  baseFont?: string;
  encoding?: string | PDFDict;
  toUnicode?: Uint8Array;
  firstChar?: number;
  lastChar?: number;
  widths?: number[];
  descendantFonts?: PDFRef[];
  // Parsed encoding data
  charCodeToUnicode?: Map<number, string>;
  unicodeToCharCode?: Map<string, number>;
  differences?: Map<number, string>;
}

// Modification types
export interface TextModification {
  pageIndex: number;
  opIndex: number;
  newText: string;
}

// Helper functions
export function isName(v: PDFValue): v is PDFName {
  return v !== null && typeof v === 'object' && 'type' in v && v.type === 'name';
}

export function isArray(v: PDFValue): v is PDFArray {
  return v !== null && typeof v === 'object' && 'type' in v && v.type === 'array';
}

export function isDict(v: PDFValue): v is PDFDict {
  return v !== null && typeof v === 'object' && 'type' in v && v.type === 'dict';
}

export function isStream(v: PDFValue): v is PDFStream {
  return v !== null && typeof v === 'object' && 'type' in v && v.type === 'stream';
}

export function isRef(v: PDFValue): v is PDFRef {
  return v !== null && typeof v === 'object' && 'type' in v && v.type === 'ref';
}

export function getName(v: PDFValue | undefined): string | undefined {
  if (v === undefined) return undefined;
  return isName(v) ? v.value : undefined;
}

export function getNumber(v: PDFValue | undefined): number | undefined {
  return typeof v === 'number' ? v : undefined;
}

export function getString(v: PDFValue | undefined): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

export function getArray(v: PDFValue | undefined): PDFArray | undefined {
  if (v === undefined) return undefined;
  return isArray(v) ? v : undefined;
}

export function getDict(v: PDFValue | undefined): PDFDict | undefined {
  if (v === undefined) return undefined;
  return isDict(v) ? v : undefined;
}

export function getRef(v: PDFValue | undefined): PDFRef | undefined {
  if (v === undefined) return undefined;
  return isRef(v) ? v : undefined;
}

export function dictGet(dict: PDFDict, key: string): PDFValue | undefined {
  return dict.entries.get(key);
}

export function dictGetName(dict: PDFDict, key: string): string | undefined {
  const v = dict.entries.get(key);
  return v !== undefined ? getName(v) : undefined;
}

export function dictGetNumber(dict: PDFDict, key: string): number | undefined {
  const v = dict.entries.get(key);
  return v !== undefined ? getNumber(v) : undefined;
}

export function dictGetArray(dict: PDFDict, key: string): PDFArray | undefined {
  const v = dict.entries.get(key);
  return v !== undefined ? getArray(v) : undefined;
}

export function dictGetDict(dict: PDFDict, key: string): PDFDict | undefined {
  const v = dict.entries.get(key);
  return v !== undefined ? getDict(v) : undefined;
}

export function dictGetRef(dict: PDFDict, key: string): PDFRef | undefined {
  const v = dict.entries.get(key);
  return v !== undefined ? getRef(v) : undefined;
}

export function createDict(entries?: [string, PDFValue][]): PDFDict {
  return {
    type: 'dict',
    entries: new Map(entries || []),
  };
}

export function createName(value: string): PDFName {
  return { type: 'name', value };
}

export function createArray(items: PDFValue[]): PDFArray {
  return { type: 'array', items };
}

export function createRef(objNum: number, genNum: number = 0): PDFRef {
  return { type: 'ref', objNum, genNum };
}
