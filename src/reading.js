// One MCP session = one reading session on the couch: which book is open, which page we're on,
// how many times each page was asked for again, and what the last search offered.
import { brief } from './shelf.js';

const ORD = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'];
const an = (w) => (/^[aeiou]/.test(w) ? `an ${w}` : `a ${w}`);
const endP = (t) => (/[.!?]$/.test(t) ? t : `${t}.`);   // titles may end in ? or !
const times = (n) => (n === 1 ? 'once' : n === 2 ? 'twice' : `${n} times`);
const joinAnd = (a) => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`);

export class Reading {
  constructor(shelf, bookmarks) {
    this.shelf = shelf; this.bookmarks = bookmarks;
    this.book = null; this.page = 0; this.again_counts = {}; this.finished = false;
    this.candidates = []; this.lastTerms = [];
  }

  context() {
    return {
      book: this.book ? brief(this.book) : null,
      page: this.page || null,
      pages: this.book ? this.book.pages.length : null,
      again_counts: { ...this.again_counts },
      favorite_page: this.favoritePage(),
      finished: this.finished,
      candidates: this.candidates.map((c) => ({ slug: c.slug, title_en: c.title_en })),
    };
  }

  favoritePage() {
    let best = null;
    for (const [p, n] of Object.entries(this.again_counts)) if (n >= 1 && (!best || n > best.count)) best = { page: +p, count: n };
    return best;
  }

  listShelf() {
    const books = this.shelf.books.map(brief);
    const { creatures, themes } = this.shelf.menu();
    const speech = `There are ${books.length} picture books on the shelf. Ask for one by what's in it: ${joinAnd(creatures.map(an))}. `
      + `Or by what happens: ${joinAnd(themes)}. Which one tonight?`;
    return { books, menu: { creatures, themes }, speech };
  }

  find(query) {
    const r = this.shelf.find(query);
    this.candidates = r.results.slice(0, 5);
    this.lastTerms = r.terms;
    const { creatures } = this.shelf.menu();
    let speech;
    if (!r.results.length) {
      const asked = r.terms.length ? r.terms.join(' ') : 'that';
      speech = `I don't have a book with ${asked} on this shelf. I do have ${joinAnd(creatures.map(an))}. Which one?`;
    } else if (r.results.length === 1 || r.results[0].score > r.results[1].score + 1.5) {
      const b = r.results[0];
      speech = `Found it: ${endP(b.title_en)}`;
      const matched = r.terms.filter((t) => !r.unmatched.includes(t));
      if (r.results.length > 1) speech += ` There ${r.results.length === 2 ? 'is one more' : `are ${r.results.length - 1} more`} with ${matched.join(' and ') || 'that'}, if you want a different one.`;
    } else {
      const top = r.results.filter((x) => x.score === r.results[0].score).slice(0, 3);
      const asked = top[0].why.map((w) => w.tag).filter((t, i, a) => a.indexOf(t) === i).slice(0, 2).join(' and ');
      speech = `I have ${top.length} books with ${asked}: ${joinAnd(top.map((b, i) => `number ${ORD[i + 1]}, ${b.title_en}, ${b.one_line.replace(/\.$/, '').replace(/^(A|An|The) /, (m) => m.toLowerCase())}`))}. Which one?`;
      this.candidates = top;
    }
    return { ...r, speech, decided: r.results.length === 1 || (r.results.length > 1 && r.results[0].score > r.results[1].score + 1.5) };
  }

  // Open a book (by slug, or by the number offered in the last search) and/or move to a page.
  readPage({ book, choice, page } = {}) {
    let sayTitle = false; // "the second one" -> say which book that was; after a decided search the title was just said
    if (choice != null) {
      sayTitle = true;
      const c = this.candidates[choice - 1];
      if (!c) return { error: this.candidates.length ? `I only offered ${this.candidates.length} books. Pick one of those, or ask for something else.` : 'There is no list to pick from yet. Ask for a book by what is in it first.' };
      book = c.slug;
    }
    if (book) {
      const b = this.shelf.get(book);
      if (!b) return { error: `No book called ${book} on this shelf.` };
      if (b !== this.book) { this.book = b; this.page = 0; this.again_counts = {}; this.finished = false; }
      if (page == null) page = 1;
    }
    if (!this.book) return { error: 'No book is open. Ask for one by what is in it, for example "the dinosaur one".' };
    const last = this.book.pages.length;
    if (page == null) {
      if (this.page >= last) {
        this.finished = true;
        return { ...this.#card(this.page), at_end: true, speech: `That was the last page of ${endP(this.book.title_en)} Say "again" to hear it once more, "bookmark" to keep it for tomorrow, or ask for another book.` };
      }
      page = this.page + 1;
    }
    if (page < 1 || page > last) return { error: `${this.book.title_en} has ${last} pages.` };
    this.page = page;
    if (page === last) this.finished = true;
    const p = this.book.pages[page - 1];
    const intro = page === 1 ? `${sayTitle ? `${endP(this.book.title_en)} ` : ''}Page one. ` : '';
    const outro = page === last ? ' The end. Want it again tomorrow? Say "bookmark".' : '';
    return { ...this.#card(page), speech: `${intro}${p.en}${outro}` };
  }

  again() {
    if (!this.book || !this.page) return { error: 'Nothing has been read yet. Ask for a book first.' };
    const n = (this.again_counts[this.page] || 0) + 1;
    this.again_counts[this.page] = n;
    const p = this.book.pages[this.page - 1];
    return { ...this.#card(this.page), again_count: n, speech: p.en };
  }

  bookmarkTonight({ listener } = {}) {
    if (!this.book || !this.page) return { error: 'Nothing to bookmark yet. Read a page first.' };
    const fav = this.favoritePage();
    const saved = this.bookmarks.set(listener, {
      book: this.book.slug, title_en: this.book.title_en, page: this.page, pages: this.book.pages.length,
      finished: this.finished, again_counts: { ...this.again_counts }, favorite_page: fav, saved_at: new Date().toISOString(),
    });
    const where = this.finished ? `We finished ${endP(this.book.title_en)}` : `Bookmarked ${this.book.title_en}, page ${ORD[this.page]} of ${ORD[this.book.pages.length]}.`;
    const favText = fav && fav.count >= 1 ? ` Page ${ORD[fav.page]} was the one you asked for again${fav.count > 1 ? `, ${times(fav.count)}` : ''}; I'll remember that.` : '';
    return { bookmark: saved, listener: this.bookmarks.constructor.key(listener), speech: `${where}${favText} Tomorrow, just say "where did we stop".` };
  }

  resumeTomorrow({ listener } = {}) {
    const bm = this.bookmarks.get(listener);
    if (!bm) return { error: 'There is no bookmark yet. Read something tonight and say "bookmark" before you stop.' };
    const b = this.shelf.get(bm.book);
    if (!b) return { error: `The bookmarked book (${bm.book}) is not on the shelf any more.` };
    this.book = b; this.again_counts = { ...(bm.again_counts || {}) }; this.finished = false;
    const fav = bm.favorite_page;
    const favText = fav ? ` Page ${ORD[fav.page]} was the one you asked for again${fav.count > 1 ? `, ${times(fav.count)}` : ''}.` : '';
    let page, lead;
    if (bm.finished) { page = 1; lead = `Last time we finished ${endP(b.title_en)}${favText} Starting again from page one. `; }
    else { page = bm.page; lead = `Last time we stopped at page ${ORD[bm.page]} of ${b.title_en}.${favText} Here it is. `; }
    this.page = page; if (page === b.pages.length) this.finished = true;
    const p = b.pages[page - 1];
    return { ...this.#card(page), bookmark: bm, speech: `${lead}${p.en}` };
  }

  #card(page) {
    const b = this.book; const p = b.pages[page - 1];
    return {
      book: brief(b), page, pages: b.pages.length, page_spoken: `Page ${page} of ${b.pages.length}`,
      text_en: p.en, text_ko: p.ko, image: p.image, audio: p.audio,
      again_count: this.again_counts[page] || 0, is_last: page === b.pages.length,
    };
  }
}
