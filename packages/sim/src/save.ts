import { MigrationError, migrateState } from './migrations';
import type { SimState } from './state';

export const SAVE_FORMAT = 'nyan-noodle-save';
/** Envelope version (the sim state inside carries its own `version`). */
export const SAVE_VERSION = 1;
export const EXPORT_PREFIX = 'NYAN1';

export interface SaveFile {
  readonly format: typeof SAVE_FORMAT;
  readonly saveVersion: number;
  /** ISO timestamp of the write; informational only. */
  readonly savedAt: string;
  readonly state: SimState;
}

export class SaveError extends Error {}

export function createSave(state: SimState, savedAt: string): SaveFile {
  return { format: SAVE_FORMAT, saveVersion: SAVE_VERSION, savedAt, state };
}

export function serializeSave(save: SaveFile): string {
  return JSON.stringify(save);
}

/** Parse + validate + migrate a save. Throws SaveError with a player-readable message. */
export function parseSave(json: string): SaveFile {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new SaveError('Save data is not valid JSON');
  }
  if (typeof data !== 'object' || data === null) throw new SaveError('Save data is empty');
  const file = data as Record<string, unknown>;
  if (file.format !== SAVE_FORMAT) throw new SaveError('Not a Nyan Noodle save');
  if (typeof file.saveVersion !== 'number' || file.saveVersion > SAVE_VERSION) {
    throw new SaveError('Save is from a newer version of the game');
  }
  try {
    const state = migrateState(file.state);
    return createSave(state, typeof file.savedAt === 'string' ? file.savedAt : '');
  } catch (error) {
    if (error instanceof MigrationError) throw new SaveError(error.message);
    throw error;
  }
}

// ---- export / import string -------------------------------------------------

function utf8Encode(text: string): Uint8Array {
  const out: number[] = [];
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else
      out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return Uint8Array.from(out);
}

function utf8Decode(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length;) {
    const b = bytes[i]!;
    const extra = b < 0x80 ? 0 : b < 0xe0 ? 1 : b < 0xf0 ? 2 : 3;
    let c = extra === 0 ? b : b & (0x3f >> extra);
    for (let k = 1; k <= extra; k++) c = (c << 6) | ((bytes[i + k] ?? 0) & 63);
    out += String.fromCodePoint(c);
    i += extra + 1;
  }
  return out;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function toBase64Url(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = ((bytes[i] ?? 0) << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]!;
    if (i + 1 < bytes.length) out += B64[(n >> 6) & 63]!;
    if (i + 2 < bytes.length) out += B64[n & 63]!;
  }
  return out;
}

function fromBase64Url(text: string): Uint8Array {
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const ch of text) {
    const v = B64.indexOf(ch);
    if (v < 0) throw new SaveError('Export string has invalid characters');
    buffer = (buffer << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 255);
    }
  }
  return Uint8Array.from(bytes);
}

/** FNV-1a 32-bit, hex: catches typos and truncation in a pasted export string. */
export function checksum(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** `NYAN1.<base64url(json)>.<checksum>` — safe to paste in chat or a note. */
export function exportSaveString(save: SaveFile): string {
  const json = serializeSave(save);
  const body = toBase64Url(utf8Encode(json));
  return `${EXPORT_PREFIX}.${body}.${checksum(body)}`;
}

export function importSaveString(text: string): SaveFile {
  const parts = text.trim().split('.');
  if (parts.length !== 3 || parts[0] !== EXPORT_PREFIX) {
    throw new SaveError('Not a Nyan Noodle export string');
  }
  const [, body, sum] = parts as [string, string, string];
  if (checksum(body) !== sum) throw new SaveError('Export string is damaged (checksum mismatch)');
  return parseSave(utf8Decode(fromBase64Url(body)));
}
