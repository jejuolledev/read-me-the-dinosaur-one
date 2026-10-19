// Builds data/books.json and copies the media the server serves, from Dongwhamoa's static sample-book files.
//   source: <STORYMOA_STORIES>/manifest.json, texts.json, audio/manifest.json, audio/<slug>/p*.mp3, thumbnails/<slug>.w640.webp
//   plus:   data/english.mjs (hand-written English layer) and data/media/pages/<slug>/p00..p09.jpg (scripts/render-pages.swift)
// Nothing here calls a network or a model. Run once; the output is committed so the repo runs on its own.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import english from '../data/english.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SRC = process.env.STORYMOA_STORIES || '/Users/ollekil/Desktop/Moahub-Labs/webs/Moahub-Services/storymoa/public/stories';
const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

const manifest = read(path.join(SRC, 'manifest.json'));
const texts = read(path.join(SRC, 'texts.json'));
const audio = read(path.join(SRC, 'audio', 'manifest.json'));
const mediaDir = path.join(ROOT, 'data', 'media');
fs.mkdirSync(path.join(mediaDir, 'audio'), { recursive: true });
fs.mkdirSync(path.join(mediaDir, 'covers'), { recursive: true });

const books = [];
for (const m of manifest.stories) {
  const slug = m.filename.replace(/\.pdf$/, '');
  const t = texts.stories.find((s) => s.slug === slug);
  const a = audio[slug];
  const en = english[slug];
  if (!t || !a || !en) throw new Error(`missing text/audio/english for ${slug}`);
  if (t.pages.length !== 8 || en.pages.length !== 8) throw new Error(`${slug}: expected 8 pages`);
  for (let p = 0; p <= 8; p++) {
    fs.copyFileSync(path.join(SRC, 'audio', slug, `p${p}.mp3`), path.join(mediaDir, 'audio', `${slug}-p${p}.mp3`));
  }
  fs.copyFileSync(path.join(SRC, 'thumbnails', `${slug}.w640.webp`), path.join(mediaDir, 'covers', `${slug}.webp`));
  for (let p = 0; p <= 9; p++) {
    const f = path.join(mediaDir, 'pages', slug, `p${String(p).padStart(2, '0')}.jpg`);
    if (!fs.existsSync(f)) throw new Error(`page image missing: ${f} (run scripts/render-pages.swift first)`);
  }
  const page = (n) => {
    const ap = a.pages[String(n)];
    return {
      n,
      ko: t.pages[n - 1].text,
      en: en.pages[n - 1],
      image: `/media/pages/${slug}/p${String(n).padStart(2, '0')}.jpg`,
      audio: { src: `/media/audio/${slug}-p${n}.mp3`, duration: ap.duration, sentences: ap.sentences },
    };
  };
  const pages = [1, 2, 3, 4, 5, 6, 7, 8].map(page);
  const total = Object.values(a.pages).reduce((s, p) => s + p.duration, 0);
  books.push({
    slug,
    title_ko: m.title,
    subtitle_ko: m.subtitle,
    mood_ko: t.mood,
    title_en: en.title_en,
    one_line: en.one_line,
    creatures: en.creatures,
    themes: en.themes,
    settings: en.settings,
    colors: en.colors,
    cover: `/media/covers/${slug}.webp`,
    cover_page: `/media/pages/${slug}/p00.jpg`,
    end_page: `/media/pages/${slug}/p09.jpg`,
    title_audio: { src: `/media/audio/${slug}-p0.mp3`, duration: a.pages['0'].duration },
    narration_minutes: Math.round(total / 6) / 10,
    created_at: m.created_at,
    pages,
  });
}
const out = {
  about: {
    publisher: 'Dongwhamoa (MoaHub), sample picture books shown on dongwhamoa.com',
    note: 'Eleven sample books created by Dongwhamoa for its public shelf. Text, pictures and narration were generated with AI tools and edited by Dongwhamoa; the child characters are invented. The English page text and tags were written by hand for this project.',
    narration: 'Korean narration synthesized with an on-device text-to-speech model; sentence timestamps come from the same pipeline.',
    source_updated_at: manifest.updated_at,
    built_at: new Date().toISOString(),
  },
  books,
};
fs.writeFileSync(path.join(ROOT, 'data', 'books.json'), JSON.stringify(out, null, 1));
console.log(`books.json: ${books.length} books, ${books.reduce((s, b) => s + b.pages.length, 0)} pages; media in data/media`);
