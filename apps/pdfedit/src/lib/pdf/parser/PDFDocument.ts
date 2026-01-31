// PDF Document - High-level document interface

import { PDFParser } from './PDFParser';
import { StreamDecoder } from './StreamDecoder';
import {
  PDFValue,
  PDFDict,
  PDFStream,
  PDFRef,
  isDict,
  isArray,
  isStream,
  isRef,
  dictGet,
  dictGetRef,
  dictGetArray,
  dictGetNumber,
  dictGetName,
  createDict,
} from '../types';

export interface PageInfo {
  index: number;
  width: number;
  height: number;
  mediaBox: [number, number, number, number];
  cropBox?: [number, number, number, number];
  rotation: number;
  resourcesRef?: PDFRef;
  contentsRef?: PDFRef | PDFRef[];
}

export class PDFDocument {
  private parser: PDFParser;
  private _pages: PageInfo[] = [];
  private _version: string = '1.4';
  private _modifiedObjects: Map<number, PDFValue> = new Map();
  private _nextObjNum: number = 1;
  private bytes: Uint8Array;

  constructor(bytes: Uint8Array) {
    // Store our own copy to avoid detached buffer issues
    this.bytes = new Uint8Array(bytes);
    this.parser = new PDFParser(this.bytes);
  }

  static async load(bytes: Uint8Array): Promise<PDFDocument> {
    const doc = new PDFDocument(bytes);
    await doc.parse();
    return doc;
  }

  private async parse(): Promise<void> {
    // Parse header for version
    const header = this.bytes.slice(0, 20);
    const headerStr = new TextDecoder().decode(header);
    const match = headerStr.match(/%PDF-(\d+\.\d+)/);
    if (match) {
      this._version = match[1];
    }

    // Parse xref and trailer
    this.parser.parse();

    // Find highest object number
    for (const objNum of this.parser.xrefTable.keys()) {
      if (objNum >= this._nextObjNum) {
        this._nextObjNum = objNum + 1;
      }
    }

    // Build page tree
    await this.buildPageTree();
  }

  private async buildPageTree(): Promise<void> {
    if (!this.parser.trailer) return;

    const rootRef = dictGetRef(this.parser.trailer, 'Root');
    if (!rootRef) return;

    const root = this.parser.resolve(rootRef);
    if (!isDict(root)) return;

    const pagesRef = dictGetRef(root, 'Pages');
    if (!pagesRef) return;

    const pagesDict = this.parser.resolve(pagesRef);
    if (!isDict(pagesDict)) return;

    this.collectPages(pagesDict);
  }

  private collectPages(node: PDFDict, inheritedResources?: PDFRef): void {
    const type = dictGetName(node, 'Type');

    if (type === 'Page') {
      const mediaBox = this.getBox(node, 'MediaBox') ?? [0, 0, 612, 792];
      const cropBox = this.getBox(node, 'CropBox');
      const rotation = dictGetNumber(node, 'Rotate') ?? 0;

      const resourcesRef = dictGetRef(node, 'Resources');
      const contentsRef = this.getContentsRef(node);

      this._pages.push({
        index: this._pages.length,
        width: mediaBox[2] - mediaBox[0],
        height: mediaBox[3] - mediaBox[1],
        mediaBox: mediaBox as [number, number, number, number],
        cropBox: cropBox as [number, number, number, number] | undefined,
        rotation,
        resourcesRef: resourcesRef ?? inheritedResources,
        contentsRef,
      });
    } else if (type === 'Pages') {
      const kids = dictGetArray(node, 'Kids');
      if (!kids) return;

      const resourcesRef = dictGetRef(node, 'Resources') ?? inheritedResources;

      for (const kidRef of kids.items) {
        if (isRef(kidRef)) {
          const kid = this.parser.resolve(kidRef);
          if (isDict(kid)) {
            this.collectPages(kid, resourcesRef);
          }
        }
      }
    }
  }

  private getBox(node: PDFDict, key: string): number[] | undefined {
    const box = dictGetArray(node, key);
    if (!box) return undefined;
    return box.items.map((v) => (typeof v === 'number' ? v : 0));
  }

  private getContentsRef(node: PDFDict): PDFRef | PDFRef[] | undefined {
    const contents = dictGet(node, 'Contents');
    if (!contents) return undefined;

    if (isRef(contents)) {
      return contents;
    }

    if (isArray(contents)) {
      return contents.items.filter(isRef) as PDFRef[];
    }

    return undefined;
  }

  get version(): string {
    return this._version;
  }

  get pageCount(): number {
    return this._pages.length;
  }

  get pages(): PageInfo[] {
    return this._pages;
  }

  get trailer(): PDFDict | null {
    return this.parser.trailer;
  }

  getObject(objNum: number): PDFValue | undefined {
    // Check modified objects first
    if (this._modifiedObjects.has(objNum)) {
      return this._modifiedObjects.get(objNum);
    }
    return this.parser.getObject(objNum);
  }

  resolve(value: PDFValue): PDFValue {
    if (isRef(value)) {
      return this.getObject(value.objNum) ?? null;
    }
    return value;
  }

  // Get page resources
  getPageResources(pageIndex: number): PDFDict | undefined {
    const page = this._pages[pageIndex];
    if (!page?.resourcesRef) return undefined;

    const resources = this.resolve(page.resourcesRef);
    return isDict(resources) ? resources : undefined;
  }

  // Get page content stream(s)
  getPageContents(pageIndex: number): Uint8Array[] {
    const page = this._pages[pageIndex];
    if (!page?.contentsRef) return [];

    const refs = Array.isArray(page.contentsRef)
      ? page.contentsRef
      : [page.contentsRef];

    const contents: Uint8Array[] = [];

    for (const ref of refs) {
      const obj = this.resolve(ref);
      if (isStream(obj)) {
        contents.push(StreamDecoder.decode(obj));
      }
    }

    return contents;
  }

  // Get raw page content stream object(s)
  getPageContentStreams(pageIndex: number): PDFStream[] {
    const page = this._pages[pageIndex];
    if (!page?.contentsRef) return [];

    const refs = Array.isArray(page.contentsRef)
      ? page.contentsRef
      : [page.contentsRef];

    const streams: PDFStream[] = [];

    for (const ref of refs) {
      const obj = this.resolve(ref);
      if (isStream(obj)) {
        streams.push(obj);
      }
    }

    return streams;
  }

  // Get fonts from page resources
  getPageFonts(pageIndex: number): Map<string, PDFDict> {
    const fonts = new Map<string, PDFDict>();
    const resources = this.getPageResources(pageIndex);
    if (!resources) return fonts;

    const fontDict = dictGet(resources, 'Font');
    if (!fontDict) return fonts;

    const resolved = this.resolve(fontDict);
    if (!isDict(resolved) || !resolved.entries) return fonts;

    for (const [name, value] of resolved.entries) {
      const font = this.resolve(value);
      if (isDict(font)) {
        fonts.set(name, font);
      }
    }

    return fonts;
  }

  // Modify an object
  setObject(objNum: number, value: PDFValue): void {
    this._modifiedObjects.set(objNum, value);
  }

  // Allocate new object number
  allocateObjectNumber(): number {
    return this._nextObjNum++;
  }

  // Get modified objects for writing
  getModifiedObjects(): Map<number, PDFValue> {
    return this._modifiedObjects;
  }

  // Update page content stream
  updatePageContents(pageIndex: number, newContent: Uint8Array): void {
    const page = this._pages[pageIndex];
    if (!page?.contentsRef) {
      console.error('updatePageContents: No contentsRef for page', pageIndex);
      return;
    }

    // Warn about multiple content streams
    if (Array.isArray(page.contentsRef) && page.contentsRef.length > 1) {
      console.warn(`updatePageContents: Page ${pageIndex} has ${page.contentsRef.length} content streams. Only updating the first one.`);
    }

    // For now, only handle single content stream
    const ref = Array.isArray(page.contentsRef)
      ? page.contentsRef[0]
      : page.contentsRef;

    const existingStream = this.resolve(ref);
    if (!isStream(existingStream)) {
      console.error('updatePageContents: Existing content is not a stream', ref);
      return;
    }

    console.log('updatePageContents: Updating object', ref.objNum, 'with', newContent.length, 'bytes');
    console.log('updatePageContents: Old stream length:', existingStream.data.length);

    // Create new stream with updated content (uncompressed)
    const newStream: PDFStream = {
      type: 'stream',
      dict: createDict([
        ['Length', newContent.length],
        // Don't compress for now to keep it simple
      ]),
      data: newContent,
    };

    this.setObject(ref.objNum, newStream);
    console.log('updatePageContents: Modified objects now:', Array.from(this._modifiedObjects.keys()));
  }

  // Get original bytes
  get originalBytes(): Uint8Array {
    return this.bytes;
  }

  // Get parser for advanced access
  get _parser(): PDFParser {
    return this.parser;
  }
}
