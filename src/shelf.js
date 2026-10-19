// The bookshelf: eleven sample picture books, searchable by what is in them
// ("dinosaur", "brushing teeth", "the scared one") rather than by title.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const BOOKS_FILE = path.resolve(HERE, '../data/books.json');

// Words a child (or Alexa's transcript) might use -> the tag the shelf uses.
const SYNONYMS = {
  dino: 'dinosaur', dinosaurs: 'dinosaur', 't-rex': 'dinosaur', trex: 'dinosaur',
  bunny: 'rabbit', bunnies: 'rabbit', rabbits: 'rabbit', hare: 'rabbit',
  kitty: 'cat', kitten: 'cat', cats: 'cat', kitties: 'cat',
  whales: 'whale', penguins: 'penguin', pandas: 'panda', owls: 'owl', squirrels: 'squirrel', bears: 'bear', raccoons: 'raccoon',
  teeth: 'brushing teeth', tooth: 'brushing teeth', brush: 'brushing teeth', brushing: 'brushing teeth', toothbrush: 'brushing teeth',
  sleep: 'bedtime', sleeping: 'bedtime', sleepy: 'bedtime', bed: 'bedtime', nap: 'bedtime', goodnight: 'bedtime',
  scared: 'fear', scary: 'fear', afraid: 'fear', fear: 'fear', frightened: 'fear', brave: 'brave', courage: 'courage',
  dark: 'the dark', alone: 'sleeping alone',
  birthday: 'birthday', cake: 'cake', candles: 'candles', candle: 'candles', balloon: 'balloon', balloons: 'balloon',
  baby: 'new baby', sibling: 'new baby', brother: 'new baby', sister: 'new baby', newborn: 'new baby',
  school: 'daycare', preschool: 'daycare', kindergarten: 'daycare', nursery: 'daycare',
  eat: 'eating', eating: 'eating', food: 'eating', dinner: 'eating', meal: 'eating', supper: 'eating', 'picky': 'picky eater',
  bread: 'bread', bakery: 'bakery', baker: 'bakery', baking: 'bread',
  rain: 'why does it rain', raining: 'why does it rain', rainy: 'why does it rain', umbrella: 'umbrella', cloud: 'clouds', clouds: 'clouds',
  library: 'library', books: 'library',
  space: 'space', rocket: 'space', planet: 'space', earth: 'space',
  grandma: 'grandma', granny: 'grandma', grandmother: 'grandma', nana: 'grandma',
  picnic: 'picnic', lunchbox: 'lunchbox', lunch: 'lunchbox', acorn: 'acorn', acorns: 'acorn',
  star: 'star', stars: 'star', moon: 'moon',
  share: 'sharing', sharing: 'sharing', friends: 'friends',
  ocean: 'ocean', sea: 'ocean', underwater: 'ocean', seashell: 'seashell', shell: 'seashell',
  forest: 'forest', woods: 'forest', beach: 'beach', sand: 'beach', snow: 'snow land', snowy: 'snow land',
  ribbon: 'ribbon', handkerchief: 'handkerchief', hanky: 'handkerchief', swing: 'swing', swings: 'swing',
  mom: 'mom', mommy: 'mom', mama: 'mom', mother: 'mom', hat: 'hat',
  purple: 'purple', blue: 'blue', yellow: 'yellow', green: 'green', mint: 'mint', red: 'red', rainbow: 'rainbow',
  laugh: 'laughing', funny: 'laughing', silly: 'laughing', laughing: 'laughing',
  jealous: 'jealous', sad: 'feelings', feelings: 'feelings', family: 'family',
  curious: 'curiosity', why: 'curiosity', question: 'questions', questions: 'questions',
  night: 'night', hill: 'hill', home: 'home', playground: 'playground', bedroom: 'bedroom',
};
const STOP = new Set(('alexa read me the one a an book story stories about with please that this tonight i want in it of and has ' +
  'is there where can you find which us my our to for from again next page play show tell listen hear something another other ' +
  'do does did on at by up as be we he she they his her its into have any some ones got get go goes went gets let lets like likes really just').split(' '));

export function tokenize(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9가-힣' -]/g, ' ').split(/[\s]+/).map((w) => w.replace(/^'|'$/g, '')).filter(Boolean);
}
export function canonical(word) {
  const w = word.replace(/'s$/, '');
  return SYNONYMS[w] || w;
}

export class Shelf {
  constructor(data) {
    this.about = data.about;
    this.books = data.books;
  }
  static load(file = BOOKS_FILE) { return new Shelf(JSON.parse(fs.readFileSync(file, 'utf8'))); }

  get(slug) { return this.books.find((b) => b.slug === slug) || null; }

  // What a child can ask for, grouped for a spoken menu.
  menu() {
    const creatures = [...new Set(this.books.flatMap((b) => b.creatures.slice(0, 1)))];
    const themes = [...new Set(this.books.flatMap((b) => b.themes.slice(0, 1)))];
    return { creatures, themes };
  }

  // Score every book against the words; return the ones that match, best first, with the reason.
  find(query) {
    const raw = Array.isArray(query) ? query.flatMap(tokenize) : tokenize(query);
    const words = raw.filter((w) => !STOP.has(w));
    const terms = [...new Set(words.map(canonical))];
    const unmatched = new Set(terms);
    const results = [];
    for (const b of this.books) {
      let score = 0; const why = [];
      const text = `${b.title_en} ${b.one_line}`.toLowerCase();
      const fields = [[b.creatures, 3, 'creature'], [b.themes, 2, 'theme'], [b.settings, 1.5, 'place'], [b.colors, 1, 'color']];
      for (const t of terms) {
        let hit = null;
        for (const [list, w, kind] of fields) {
          if (list.some((x) => x === t || x.includes(t) || t.includes(x) && x.length > 3)) { hit = [w, kind, list.find((x) => x === t || x.includes(t) || t.includes(x))]; break; }
        }
        if (!hit && /[가-힣]/.test(t) && (b.title_ko.includes(t) || b.subtitle_ko.includes(t))) hit = [3, 'title', b.title_ko];
        if (!hit && t.length > 3 && new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(text)) hit = [1, 'text', t];
        if (hit) { score += hit[0]; why.push({ word: t, kind: hit[1], tag: hit[2] }); unmatched.delete(t); }
      }
      if (score > 0) results.push({ ...brief(b), score, why });
    }
    results.sort((a, b) => b.score - a.score || a.title_en.localeCompare(b.title_en));
    return { terms, unmatched: [...unmatched], results };
  }
}

export function brief(b) {
  return {
    slug: b.slug, title_en: b.title_en, title_ko: b.title_ko, one_line: b.one_line,
    creatures: b.creatures, themes: b.themes, pages: b.pages.length, narration_minutes: b.narration_minutes, cover: b.cover,
  };
}
