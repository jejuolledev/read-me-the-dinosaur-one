// One reading session: open, next, again, bookmark, resume (bookmarks persist in a temp file).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Shelf } from '../src/shelf.js';
import { Bookmarks } from '../src/bookmarks.js';
import { Reading } from '../src/reading.js';

const shelf = Shelf.load();
const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'storyshelf-')), 'bookmarks.json');

test('find -> read page one -> next -> again counts the page', () => {
  const r = new Reading(shelf, new Bookmarks(tmp()));
  const f = r.find('read me the dinosaur one');
  assert.equal(f.decided, true);
  assert.match(f.speech, /^Found it: Where Did the Dinosaur's Toothbrush Go\?$/, 'no double punctuation after a title ending in ?');
  const p1 = r.readPage({ book: f.results[0].slug });
  assert.equal(p1.page, 1);
  assert.match(p1.speech, /^Page one\. Doyun was playing/);
  assert.equal(p1.text_ko, shelf.get('doyun-dino-teeth').pages[0].ko);
  assert.equal(p1.again_count, 0);
  assert.equal(r.again().again_count, 1);
  assert.equal(r.again().again_count, 2);
  const p2 = r.readPage({});
  assert.equal(p2.page, 2);
  assert.equal(p2.again_count, 0, 'the count belongs to the page, not the session');
  assert.deepEqual(r.context().again_counts, { 1: 2 });
  assert.deepEqual(r.context().favorite_page, { page: 1, count: 2 });
});

test('"the second one" picks from what the last search offered and says the title', () => {
  const r = new Reading(shelf, new Bookmarks(tmp()));
  const f = r.find('the one with the whale');
  assert.equal(f.decided, false);
  assert.match(f.speech, /^I have 2 books with whale: number one, .+ and number two, .+\. Which one\?$/);
  const p = r.readPage({ choice: 2 });
  assert.equal(p.book.slug, f.results[1].slug);
  assert.match(p.speech, /^Luna the Dreaming Whale and Little Fear\. Page one\./);
  assert.ok(r.readPage({ choice: 3 }).error, 'there were only two');
});

test('page eight is the end; next after that does not turn', () => {
  const r = new Reading(shelf, new Bookmarks(tmp()));
  r.readPage({ book: 'mori-ep01', page: 8 });
  const p = r.readPage({});
  assert.equal(p.at_end, true);
  assert.equal(p.page, 8);
  assert.match(p.speech, /last page/);
  assert.ok(r.readPage({ page: 9 }).error);
  assert.ok(r.readPage({ book: 'no-such-book' }).error);
});

test('errors before anything is open are spoken, not thrown', () => {
  const r = new Reading(shelf, new Bookmarks(tmp()));
  assert.ok(r.readPage({}).error);
  assert.ok(r.again().error);
  assert.ok(r.bookmarkTonight({}).error);
  assert.ok(r.resumeTomorrow({}).error);
  assert.ok(r.readPage({ choice: 1 }).error);
});

test('bookmark tonight, resume tomorrow in a new session, from the file', () => {
  const file = tmp();
  const night1 = new Reading(shelf, new Bookmarks(file));
  night1.readPage({ book: 'luna-ep01', page: 5 });
  night1.again(); night1.again();
  const bm = night1.bookmarkTonight({ listener: 'Mina' });
  assert.equal(bm.listener, 'mina');
  assert.match(bm.speech, /Bookmarked Luna the Dreaming Whale and Little Fear, page five of eight\. Page five was the one you asked for again, twice/);
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).mina.page, 5, 'written to disk');

  const night2 = new Reading(shelf, new Bookmarks(file)); // a fresh server start reads the file
  assert.ok(night2.resumeTomorrow({ listener: 'home' }).error, 'a different listener has no bookmark');
  const p = night2.resumeTomorrow({ listener: 'mina' });
  assert.equal(p.page, 5);
  assert.equal(p.again_count, 2);
  assert.match(p.speech, /^Last time we stopped at page five of Luna the Dreaming Whale and Little Fear\. Page five was the one you asked for again, twice\. Here it is\. "Little Fear\."/);
  assert.equal(night2.readPage({}).page, 6);
});

test('a finished book resumes from page one', () => {
  const file = tmp();
  const r = new Reading(shelf, new Bookmarks(file));
  r.readPage({ book: 'jia-rabbit-daycare', page: 8 });
  assert.match(r.bookmarkTonight({}).speech, /^We finished The Yellow Handkerchief's Day\./);
  const p = new Reading(shelf, new Bookmarks(file)).resumeTomorrow({});
  assert.equal(p.page, 1);
  assert.match(p.speech, /Starting again from page one/);
});

test('list_shelf offers creatures and worries', () => {
  const r = new Reading(shelf, new Bookmarks(tmp()));
  const l = r.listShelf();
  assert.equal(l.books.length, 11);
  assert.match(l.speech, /a dinosaur/);
  assert.match(l.speech, /brushing teeth/);
});
