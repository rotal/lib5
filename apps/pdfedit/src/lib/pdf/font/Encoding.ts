// Standard PDF Encodings

// Standard Encoding
export const STANDARD_ENCODING: (string | null)[] = new Array(256).fill(null);
// Partial - only common characters shown
[
  [0x20, 'space'],
  [0x21, 'exclam'],
  [0x22, 'quotedbl'],
  [0x23, 'numbersign'],
  [0x24, 'dollar'],
  [0x25, 'percent'],
  [0x26, 'ampersand'],
  [0x27, 'quoteright'],
  [0x28, 'parenleft'],
  [0x29, 'parenright'],
  [0x2a, 'asterisk'],
  [0x2b, 'plus'],
  [0x2c, 'comma'],
  [0x2d, 'hyphen'],
  [0x2e, 'period'],
  [0x2f, 'slash'],
  [0x30, 'zero'],
  [0x31, 'one'],
  [0x32, 'two'],
  [0x33, 'three'],
  [0x34, 'four'],
  [0x35, 'five'],
  [0x36, 'six'],
  [0x37, 'seven'],
  [0x38, 'eight'],
  [0x39, 'nine'],
  [0x3a, 'colon'],
  [0x3b, 'semicolon'],
  [0x3c, 'less'],
  [0x3d, 'equal'],
  [0x3e, 'greater'],
  [0x3f, 'question'],
  [0x40, 'at'],
  [0x41, 'A'], [0x42, 'B'], [0x43, 'C'], [0x44, 'D'], [0x45, 'E'],
  [0x46, 'F'], [0x47, 'G'], [0x48, 'H'], [0x49, 'I'], [0x4a, 'J'],
  [0x4b, 'K'], [0x4c, 'L'], [0x4d, 'M'], [0x4e, 'N'], [0x4f, 'O'],
  [0x50, 'P'], [0x51, 'Q'], [0x52, 'R'], [0x53, 'S'], [0x54, 'T'],
  [0x55, 'U'], [0x56, 'V'], [0x57, 'W'], [0x58, 'X'], [0x59, 'Y'],
  [0x5a, 'Z'],
  [0x5b, 'bracketleft'],
  [0x5c, 'backslash'],
  [0x5d, 'bracketright'],
  [0x5e, 'asciicircum'],
  [0x5f, 'underscore'],
  [0x60, 'quoteleft'],
  [0x61, 'a'], [0x62, 'b'], [0x63, 'c'], [0x64, 'd'], [0x65, 'e'],
  [0x66, 'f'], [0x67, 'g'], [0x68, 'h'], [0x69, 'i'], [0x6a, 'j'],
  [0x6b, 'k'], [0x6c, 'l'], [0x6d, 'm'], [0x6e, 'n'], [0x6f, 'o'],
  [0x70, 'p'], [0x71, 'q'], [0x72, 'r'], [0x73, 's'], [0x74, 't'],
  [0x75, 'u'], [0x76, 'v'], [0x77, 'w'], [0x78, 'x'], [0x79, 'y'],
  [0x7a, 'z'],
  [0x7b, 'braceleft'],
  [0x7c, 'bar'],
  [0x7d, 'braceright'],
  [0x7e, 'asciitilde'],
].forEach(([code, name]) => {
  STANDARD_ENCODING[code as number] = name as string;
});

// WinAnsi Encoding (Windows-1252)
export const WIN_ANSI_ENCODING: (string | null)[] = new Array(256).fill(null);
// This is essentially Windows-1252
for (let i = 0x20; i <= 0x7e; i++) {
  WIN_ANSI_ENCODING[i] = String.fromCharCode(i);
}
// Extended characters
const WIN_ANSI_EXTENDED: [number, string][] = [
  [0x80, '\u20AC'], // Euro
  [0x82, '\u201A'], // Single Low-9 Quotation
  [0x83, '\u0192'], // f with hook
  [0x84, '\u201E'], // Double Low-9 Quotation
  [0x85, '\u2026'], // Horizontal Ellipsis
  [0x86, '\u2020'], // Dagger
  [0x87, '\u2021'], // Double Dagger
  [0x88, '\u02C6'], // Modifier Letter Circumflex Accent
  [0x89, '\u2030'], // Per Mille Sign
  [0x8A, '\u0160'], // S with caron
  [0x8B, '\u2039'], // Single Left-Pointing Angle Quotation
  [0x8C, '\u0152'], // OE ligature
  [0x8E, '\u017D'], // Z with caron
  [0x91, '\u2018'], // Left Single Quotation
  [0x92, '\u2019'], // Right Single Quotation
  [0x93, '\u201C'], // Left Double Quotation
  [0x94, '\u201D'], // Right Double Quotation
  [0x95, '\u2022'], // Bullet
  [0x96, '\u2013'], // En Dash
  [0x97, '\u2014'], // Em Dash
  [0x98, '\u02DC'], // Small Tilde
  [0x99, '\u2122'], // Trade Mark Sign
  [0x9A, '\u0161'], // s with caron
  [0x9B, '\u203A'], // Single Right-Pointing Angle Quotation
  [0x9C, '\u0153'], // oe ligature
  [0x9E, '\u017E'], // z with caron
  [0x9F, '\u0178'], // Y with diaeresis
];
WIN_ANSI_EXTENDED.forEach(([code, char]) => {
  WIN_ANSI_ENCODING[code] = char;
});
// Latin-1 supplement (0xA0-0xFF)
for (let i = 0xa0; i <= 0xff; i++) {
  WIN_ANSI_ENCODING[i] = String.fromCharCode(i);
}

// MacRoman Encoding
export const MAC_ROMAN_ENCODING: (string | null)[] = new Array(256).fill(null);
// ASCII range
for (let i = 0x20; i <= 0x7e; i++) {
  MAC_ROMAN_ENCODING[i] = String.fromCharCode(i);
}
// Mac-specific extended characters
const MAC_ROMAN_EXTENDED: [number, string][] = [
  [0x80, '\u00C4'], // A with diaeresis
  [0x81, '\u00C5'], // A with ring
  [0x82, '\u00C7'], // C with cedilla
  [0x83, '\u00C9'], // E with acute
  [0x84, '\u00D1'], // N with tilde
  [0x85, '\u00D6'], // O with diaeresis
  [0x86, '\u00DC'], // U with diaeresis
  [0x87, '\u00E1'], // a with acute
  [0x88, '\u00E0'], // a with grave
  [0x89, '\u00E2'], // a with circumflex
  [0x8A, '\u00E4'], // a with diaeresis
  [0x8B, '\u00E3'], // a with tilde
  [0x8C, '\u00E5'], // a with ring
  [0x8D, '\u00E7'], // c with cedilla
  [0x8E, '\u00E9'], // e with acute
  [0x8F, '\u00E8'], // e with grave
  [0x90, '\u00EA'], // e with circumflex
  [0x91, '\u00EB'], // e with diaeresis
  [0x92, '\u00ED'], // i with acute
  [0x93, '\u00EC'], // i with grave
  [0x94, '\u00EE'], // i with circumflex
  [0x95, '\u00EF'], // i with diaeresis
  [0x96, '\u00F1'], // n with tilde
  [0x97, '\u00F3'], // o with acute
  [0x98, '\u00F2'], // o with grave
  [0x99, '\u00F4'], // o with circumflex
  [0x9A, '\u00F6'], // o with diaeresis
  [0x9B, '\u00F5'], // o with tilde
  [0x9C, '\u00FA'], // u with acute
  [0x9D, '\u00F9'], // u with grave
  [0x9E, '\u00FB'], // u with circumflex
  [0x9F, '\u00FC'], // u with diaeresis
  [0xA0, '\u2020'], // Dagger
  [0xA1, '\u00B0'], // Degree
  [0xA2, '\u00A2'], // Cent
  [0xA3, '\u00A3'], // Pound
  [0xA4, '\u00A7'], // Section
  [0xA5, '\u2022'], // Bullet
  [0xA6, '\u00B6'], // Pilcrow
  [0xA7, '\u00DF'], // Sharp s
  [0xA8, '\u00AE'], // Registered
  [0xA9, '\u00A9'], // Copyright
  [0xAA, '\u2122'], // Trademark
  [0xAB, '\u00B4'], // Acute accent
  [0xAC, '\u00A8'], // Diaeresis
  [0xAD, '\u2260'], // Not equal
  [0xAE, '\u00C6'], // AE
  [0xAF, '\u00D8'], // O with stroke
  [0xB0, '\u221E'], // Infinity
  [0xB1, '\u00B1'], // Plus-minus
  [0xB2, '\u2264'], // Less-than or equal
  [0xB3, '\u2265'], // Greater-than or equal
  [0xB4, '\u00A5'], // Yen
  [0xB5, '\u00B5'], // Micro
  [0xB6, '\u2202'], // Partial differential
  [0xB7, '\u2211'], // N-ary summation
  [0xB8, '\u220F'], // N-ary product
  [0xB9, '\u03C0'], // Pi
  [0xBA, '\u222B'], // Integral
  [0xBB, '\u00AA'], // Feminine ordinal
  [0xBC, '\u00BA'], // Masculine ordinal
  [0xBD, '\u03A9'], // Omega
  [0xBE, '\u00E6'], // ae
  [0xBF, '\u00F8'], // o with stroke
  [0xC0, '\u00BF'], // Inverted question mark
  [0xC1, '\u00A1'], // Inverted exclamation
  [0xC2, '\u00AC'], // Not sign
  [0xC3, '\u221A'], // Square root
  [0xC4, '\u0192'], // f with hook
  [0xC5, '\u2248'], // Almost equal
  [0xC6, '\u2206'], // Increment
  [0xC7, '\u00AB'], // Left guillemet
  [0xC8, '\u00BB'], // Right guillemet
  [0xC9, '\u2026'], // Horizontal ellipsis
  [0xCA, '\u00A0'], // Non-breaking space
  [0xCB, '\u00C0'], // A with grave
  [0xCC, '\u00C3'], // A with tilde
  [0xCD, '\u00D5'], // O with tilde
  [0xCE, '\u0152'], // OE
  [0xCF, '\u0153'], // oe
  [0xD0, '\u2013'], // En dash
  [0xD1, '\u2014'], // Em dash
  [0xD2, '\u201C'], // Left double quote
  [0xD3, '\u201D'], // Right double quote
  [0xD4, '\u2018'], // Left single quote
  [0xD5, '\u2019'], // Right single quote
  [0xD6, '\u00F7'], // Division
  [0xD7, '\u25CA'], // Lozenge
  [0xD8, '\u00FF'], // y with diaeresis
  [0xD9, '\u0178'], // Y with diaeresis
  [0xDA, '\u2044'], // Fraction slash
  [0xDB, '\u20AC'], // Euro
  [0xDC, '\u2039'], // Single left angle quote
  [0xDD, '\u203A'], // Single right angle quote
  [0xDE, '\uFB01'], // fi ligature
  [0xDF, '\uFB02'], // fl ligature
  [0xE0, '\u2021'], // Double dagger
  [0xE1, '\u00B7'], // Middle dot
  [0xE2, '\u201A'], // Single low-9 quote
  [0xE3, '\u201E'], // Double low-9 quote
  [0xE4, '\u2030'], // Per mille
  [0xE5, '\u00C2'], // A with circumflex
  [0xE6, '\u00CA'], // E with circumflex
  [0xE7, '\u00C1'], // A with acute
  [0xE8, '\u00CB'], // E with diaeresis
  [0xE9, '\u00C8'], // E with grave
  [0xEA, '\u00CD'], // I with acute
  [0xEB, '\u00CE'], // I with circumflex
  [0xEC, '\u00CF'], // I with diaeresis
  [0xED, '\u00CC'], // I with grave
  [0xEE, '\u00D3'], // O with acute
  [0xEF, '\u00D4'], // O with circumflex
  [0xF0, '\uF8FF'], // Apple logo (private use)
  [0xF1, '\u00D2'], // O with grave
  [0xF2, '\u00DA'], // U with acute
  [0xF3, '\u00DB'], // U with circumflex
  [0xF4, '\u00D9'], // U with grave
  [0xF5, '\u0131'], // Dotless i
  [0xF6, '\u02C6'], // Modifier circumflex
  [0xF7, '\u02DC'], // Small tilde
  [0xF8, '\u00AF'], // Macron
  [0xF9, '\u02D8'], // Breve
  [0xFA, '\u02D9'], // Dot above
  [0xFB, '\u02DA'], // Ring above
  [0xFC, '\u00B8'], // Cedilla
  [0xFD, '\u02DD'], // Double acute
  [0xFE, '\u02DB'], // Ogonek
  [0xFF, '\u02C7'], // Caron
];
MAC_ROMAN_EXTENDED.forEach(([code, char]) => {
  MAC_ROMAN_ENCODING[code] = char;
});

// Adobe Glyph Name to Unicode mapping (partial - common glyphs)
export const GLYPH_TO_UNICODE: Map<string, string> = new Map([
  ['space', ' '],
  ['exclam', '!'],
  ['quotedbl', '"'],
  ['numbersign', '#'],
  ['dollar', '$'],
  ['percent', '%'],
  ['ampersand', '&'],
  ['quotesingle', "'"],
  ['quoteright', '\u2019'],
  ['quoteleft', '\u2018'],
  ['parenleft', '('],
  ['parenright', ')'],
  ['asterisk', '*'],
  ['plus', '+'],
  ['comma', ','],
  ['hyphen', '-'],
  ['minus', '\u2212'],
  ['period', '.'],
  ['slash', '/'],
  ['zero', '0'],
  ['one', '1'],
  ['two', '2'],
  ['three', '3'],
  ['four', '4'],
  ['five', '5'],
  ['six', '6'],
  ['seven', '7'],
  ['eight', '8'],
  ['nine', '9'],
  ['colon', ':'],
  ['semicolon', ';'],
  ['less', '<'],
  ['equal', '='],
  ['greater', '>'],
  ['question', '?'],
  ['at', '@'],
  ['A', 'A'], ['B', 'B'], ['C', 'C'], ['D', 'D'], ['E', 'E'],
  ['F', 'F'], ['G', 'G'], ['H', 'H'], ['I', 'I'], ['J', 'J'],
  ['K', 'K'], ['L', 'L'], ['M', 'M'], ['N', 'N'], ['O', 'O'],
  ['P', 'P'], ['Q', 'Q'], ['R', 'R'], ['S', 'S'], ['T', 'T'],
  ['U', 'U'], ['V', 'V'], ['W', 'W'], ['X', 'X'], ['Y', 'Y'],
  ['Z', 'Z'],
  ['bracketleft', '['],
  ['backslash', '\\'],
  ['bracketright', ']'],
  ['asciicircum', '^'],
  ['underscore', '_'],
  ['grave', '`'],
  ['a', 'a'], ['b', 'b'], ['c', 'c'], ['d', 'd'], ['e', 'e'],
  ['f', 'f'], ['g', 'g'], ['h', 'h'], ['i', 'i'], ['j', 'j'],
  ['k', 'k'], ['l', 'l'], ['m', 'm'], ['n', 'n'], ['o', 'o'],
  ['p', 'p'], ['q', 'q'], ['r', 'r'], ['s', 's'], ['t', 't'],
  ['u', 'u'], ['v', 'v'], ['w', 'w'], ['x', 'x'], ['y', 'y'],
  ['z', 'z'],
  ['braceleft', '{'],
  ['bar', '|'],
  ['braceright', '}'],
  ['asciitilde', '~'],
  ['bullet', '\u2022'],
  ['ellipsis', '\u2026'],
  ['emdash', '\u2014'],
  ['endash', '\u2013'],
  ['fi', '\uFB01'],
  ['fl', '\uFB02'],
  ['fraction', '\u2044'],
  ['guillemotleft', '\u00AB'],
  ['guillemotright', '\u00BB'],
  ['guilsinglleft', '\u2039'],
  ['guilsinglright', '\u203A'],
  ['quotedblleft', '\u201C'],
  ['quotedblright', '\u201D'],
  ['quotedblbase', '\u201E'],
  ['quotesinglbase', '\u201A'],
  ['trademark', '\u2122'],
  ['registered', '\u00AE'],
  ['copyright', '\u00A9'],
  ['degree', '\u00B0'],
  ['plusminus', '\u00B1'],
  ['multiply', '\u00D7'],
  ['divide', '\u00F7'],
  ['Euro', '\u20AC'],
  ['sterling', '\u00A3'],
  ['yen', '\u00A5'],
  ['cent', '\u00A2'],
  // Accented characters
  ['Aacute', '\u00C1'], ['aacute', '\u00E1'],
  ['Acircumflex', '\u00C2'], ['acircumflex', '\u00E2'],
  ['Adieresis', '\u00C4'], ['adieresis', '\u00E4'],
  ['Agrave', '\u00C0'], ['agrave', '\u00E0'],
  ['Aring', '\u00C5'], ['aring', '\u00E5'],
  ['Atilde', '\u00C3'], ['atilde', '\u00E3'],
  ['Ccedilla', '\u00C7'], ['ccedilla', '\u00E7'],
  ['Eacute', '\u00C9'], ['eacute', '\u00E9'],
  ['Ecircumflex', '\u00CA'], ['ecircumflex', '\u00EA'],
  ['Edieresis', '\u00CB'], ['edieresis', '\u00EB'],
  ['Egrave', '\u00C8'], ['egrave', '\u00E8'],
  ['Iacute', '\u00CD'], ['iacute', '\u00ED'],
  ['Icircumflex', '\u00CE'], ['icircumflex', '\u00EE'],
  ['Idieresis', '\u00CF'], ['idieresis', '\u00EF'],
  ['Igrave', '\u00CC'], ['igrave', '\u00EC'],
  ['Ntilde', '\u00D1'], ['ntilde', '\u00F1'],
  ['Oacute', '\u00D3'], ['oacute', '\u00F3'],
  ['Ocircumflex', '\u00D4'], ['ocircumflex', '\u00F4'],
  ['Odieresis', '\u00D6'], ['odieresis', '\u00F6'],
  ['Ograve', '\u00D2'], ['ograve', '\u00F2'],
  ['Otilde', '\u00D5'], ['otilde', '\u00F5'],
  ['Scaron', '\u0160'], ['scaron', '\u0161'],
  ['Uacute', '\u00DA'], ['uacute', '\u00FA'],
  ['Ucircumflex', '\u00DB'], ['ucircumflex', '\u00FB'],
  ['Udieresis', '\u00DC'], ['udieresis', '\u00FC'],
  ['Ugrave', '\u00D9'], ['ugrave', '\u00F9'],
  ['Yacute', '\u00DD'], ['yacute', '\u00FD'],
  ['Ydieresis', '\u0178'], ['ydieresis', '\u00FF'],
  ['Zcaron', '\u017D'], ['zcaron', '\u017E'],
  ['AE', '\u00C6'], ['ae', '\u00E6'],
  ['OE', '\u0152'], ['oe', '\u0153'],
  ['Oslash', '\u00D8'], ['oslash', '\u00F8'],
  ['germandbls', '\u00DF'],
  ['mu', '\u00B5'],
]);

// Unicode to glyph name (reverse mapping)
export const UNICODE_TO_GLYPH: Map<string, string> = new Map();
for (const [glyph, unicode] of GLYPH_TO_UNICODE) {
  UNICODE_TO_GLYPH.set(unicode, glyph);
}

// Get encoding array by name
export function getEncodingByName(name: string): (string | null)[] {
  switch (name) {
    case 'WinAnsiEncoding':
      return WIN_ANSI_ENCODING;
    case 'MacRomanEncoding':
      return MAC_ROMAN_ENCODING;
    case 'StandardEncoding':
      return STANDARD_ENCODING;
    default:
      return WIN_ANSI_ENCODING; // Default fallback
  }
}
