// The shelf: find a book by what is in it, never by its title.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Shelf, tokenize, canonical } from '../src/shelf.js';

const shelf = Shelf.load();

test('loads eleven books with eight pages, pictures and narration each', () => {
  assert.equal(shelf.books.length, 11);
  for (const b of shelf.books) {
    assert.equal(b.pages.length, 8, b.slug);
    for (const p of b.pages) {
      assert.ok(p.ko && p.en && p.image.startsWith('/media/pages/'), `${b.slug} p${p.n}`);
      assert.ok(p.audio.src.endsWith(`-p${p.n}.mp3`) && p.audio.sentences.length >= 1, `${b.slug} p${p.n} audio`);
    }
    assert.ok(b.creatures.length && b.themes.length, `${b.slug} tags`);
  }
});

test('child words map to shelf tags', () => {
  assert.deepEqual(tokenize("Alexa, read me the dinosaur one!"), ['alexa', 'read', 'me', 'the', 'dinosaur', 'one']);
  assert.equal(canonical('dino'), 'dinosaur');
  assert.equal(canonical('bunny'), 'rabbit');
  assert.equal(canonical('teeth'), 'brushing teeth');
  assert.equal(canonical("whale's"), 'whale');
});

test('"the dinosaur one" is a decided single match', () => {
  const r = shelf.find('Alexa, read me the dinosaur one!');
  assert.deepEqual(r.terms, ['dinosaur']);
  assert.equal(r.results.length, 1);
  assert.equal(r.results[0].slug, 'doyun-dino-teeth');
  assert.equal(r.results[0].why[0].kind, 'creature');
});

test('two whale books tie, so the shelf must ask', () => {
  const r = shelf.find('the one with the whale');
  assert.deepEqual(r.results.slice(0, 2).map((x) => x.slug).sort(), ['luna-ep01', 'yuna-whale-sibling']);
  assert.equal(r.results[0].score, r.results[1].score);
});

test('a worry finds the book even without a creature: "the scared one", "a new baby", "bunny goes to school"', () => {
  assert.equal(shelf.find('the scared one').results[0].slug, 'luna-ep01');
  assert.equal(shelf.find('something about a new baby').results[0].slug, 'yuna-whale-sibling');
  const r = shelf.find('the one where the bunny goes to school');
  assert.equal(r.results[0].slug, 'jia-rabbit-daycare');
  assert.ok(r.results[0].score > r.results[1].score + 1.5, 'rabbit + daycare beats the other rabbit books clearly');
  assert.equal(shelf.find('why does it rain').results[0].slug, 'owl-ep01');
  assert.equal(shelf.find('brushing teeth').results[0].slug, 'doyun-dino-teeth');
});

test('Korean title words work too', () => {
  assert.equal(shelf.find('공룡').results[0].slug, 'doyun-dino-teeth');
});

test('a creature that is not on the shelf returns nothing and names the word', () => {
  const r = shelf.find('a book about a tiger');
  assert.equal(r.results.length, 0);
  assert.deepEqual(r.unmatched, ['tiger']);
});

test('stop words alone match nothing', () => {
  assert.equal(shelf.find('read me one please').results.length, 0);
});
