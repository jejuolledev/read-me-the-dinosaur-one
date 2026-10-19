// Bookmarks outlive an MCP session ("bookmark tonight, resume tomorrow"). Kept in memory and
// mirrored to a small JSON file so a server restart doesn't lose where a family stopped.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_FILE = path.resolve(HERE, '../data/bookmarks.json');

export class Bookmarks {
  constructor(file = DEFAULT_FILE) {
    this.file = file;
    this.map = new Map();
    try { for (const [k, v] of Object.entries(JSON.parse(fs.readFileSync(file, 'utf8')))) this.map.set(k, v); } catch {}
  }
  static key(listener) { return String(listener || 'home').trim().toLowerCase() || 'home'; }
  get(listener) { return this.map.get(Bookmarks.key(listener)) || null; }
  set(listener, value) {
    this.map.set(Bookmarks.key(listener), value);
    this.#save();
    return value;
  }
  delete(listener) { const had = this.map.delete(Bookmarks.key(listener)); if (had) this.#save(); return had; }
  all() { return Object.fromEntries(this.map); }
  #save() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify(this.all(), null, 2));
    } catch (e) { console.error('[bookmarks] could not save:', e.message); }
  }
}
