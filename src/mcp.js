// The MCP server: six tools a voice assistant needs to run a bedtime reading, plus two resources.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { Reading } from './reading.js';

export const INSTRUCTIONS = `Read Me the Dinosaur One is a picture-book shelf for a small child who does not know titles.
Voice rules for the assistant:
- When the child asks for a book by what is in it ("the dinosaur one", "the one where the bunny goes to school",
  "something about a new baby"), call find_book_by_what_is_in_it with the content words. Do not ask for a title.
- If the result is decided (one clear match), call read_page with that book right away: page one is the answer.
  If it offers several, read the "speech" question and wait; the child's pick ("the first one", "the scared one")
  goes to read_page with choice, or to find_book_by_what_is_in_it again with the new words.
- Read one page per turn. Say the "speech" field almost word for word; it is the page text itself.
  Do not summarize, do not read ahead, do not add a question after every page. The last page already ends with one.
- "Again!", "one more time", "read that again" -> again. It re-reads the same page and counts it.
- "Next", "and then?", "keep going", "turn the page" -> read_page with no arguments. "Page three" -> read_page with page 3.
- "Bookmark", "stop here", "that's enough for tonight", "goodnight" -> bookmark_tonight.
- "Where did we stop?", "the book from last night", "keep reading from yesterday" -> resume_tomorrow. It reads the bookmarked page.
- "What books do you have?" -> list_shelf.
- Every page card has the original Korean text and the book's own Korean narration (audio); show them if the device has a screen.
  Never say the books were made by the listener's child: they are sample books made by Dongwhamoa.`;

export function createMcpServer(shelf, bookmarks) {
  const server = new McpServer(
    { name: 'read-me-the-dinosaur-one', title: 'Read Me the Dinosaur One', version: '0.1.0' },
    { instructions: INSTRUCTIONS, capabilities: { logging: {} } },
  );
  const reading = new Reading(shelf, bookmarks);
  const reply = (r) => (r.error
    ? { isError: true, content: [{ type: 'text', text: r.error }] }
    : { content: [{ type: 'text', text: JSON.stringify(r) }], structuredContent: r });

  const bookBrief = z.looseObject({ slug: z.string(), title_en: z.string(), title_ko: z.string(), one_line: z.string() });
  const pageCard = {
    book: bookBrief, page: z.number(), pages: z.number(), page_spoken: z.string(),
    text_en: z.string(), text_ko: z.string(), image: z.string(),
    audio: z.looseObject({ src: z.string(), duration: z.number(), sentences: z.array(z.looseObject({ text: z.string(), start: z.number(), end: z.number() })) }),
    again_count: z.number(), is_last: z.boolean(), speech: z.string(),
  };

  server.registerTool('list_shelf', {
    title: 'What is on the shelf',
    description: 'Lists the picture books on the shelf with what is in each one (creatures, themes), so the assistant can offer choices by content.',
    inputSchema: {},
    outputSchema: { books: z.array(bookBrief), menu: z.looseObject({ creatures: z.array(z.string()), themes: z.array(z.string()) }), speech: z.string() },
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  }, async () => reply(reading.listShelf()));

  server.registerTool('find_book_by_what_is_in_it', {
    title: 'Find a book by what is in it',
    description: 'Finds picture books by their contents, not their titles: creatures ("dinosaur", "bunny"), what happens ("brushing teeth", '
      + '"first day of daycare", "a new baby"), places ("space", "the beach") or colors. Returns the matches, best first, with why each matched, '
      + 'a ready-to-speak answer, and "decided" = true when one book clearly wins (then call read_page with that book).',
    inputSchema: {
      words: z.string().describe('The content words from what the child said, e.g. "dinosaur", "the one with the whale that is scared", "bunny school".'),
    },
    outputSchema: {
      terms: z.array(z.string()), unmatched: z.array(z.string()),
      results: z.array(z.looseObject({ slug: z.string(), title_en: z.string(), score: z.number(), why: z.array(z.looseObject({ word: z.string(), kind: z.string() })) })),
      decided: z.boolean(), speech: z.string(),
    },
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  }, async ({ words }) => reply(reading.find(words)));

  server.registerTool('read_page', {
    title: 'Read a page',
    description: 'Reads one page and returns the page card (English text to speak, the original Korean text, the page picture, and the book\'s own '
      + 'Korean narration with sentence timestamps). With `book` (slug from a search) it opens that book at page 1. With `choice` it opens the '
      + 'n-th book offered by the last search. With no arguments it turns to the next page of the open book. `page` jumps to a page.',
    inputSchema: {
      book: z.string().optional().describe('Book slug to open (from find_book_by_what_is_in_it or list_shelf).'),
      choice: z.number().int().min(1).max(5).optional().describe('1-based pick from the books offered by the last search ("the second one").'),
      page: z.number().int().min(1).max(8).optional().describe('Page to read. Omit to read the next page.'),
    },
    outputSchema: { ...pageCard, at_end: z.boolean().optional() },
    annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: false },
  }, async (args) => reply(reading.readPage(args)));

  server.registerTool('again', {
    title: 'Again! (read the same page once more)',
    description: 'Re-reads the page that was just read, without turning it, and counts how many times this page was asked for again. '
      + 'The count is what makes a page the child\'s favorite in bookmark_tonight and resume_tomorrow.',
    inputSchema: {},
    outputSchema: pageCard,
    annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: false },
  }, async () => reply(reading.again()));

  server.registerTool('bookmark_tonight', {
    title: 'Bookmark for tomorrow',
    description: 'Saves where this reading stopped (book, page, which pages were asked for again) so it can be picked up in a later session, '
      + 'even after the server restarts. `listener` separates bookmarks for different children in one home; default "home".',
    inputSchema: { listener: z.string().max(40).optional().describe('Whose bookmark this is, e.g. a first name. Default "home".') },
    outputSchema: { bookmark: z.looseObject({ book: z.string(), page: z.number(), finished: z.boolean() }), listener: z.string(), speech: z.string() },
    annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: false },
  }, async (args) => reply(reading.bookmarkTonight(args)));

  server.registerTool('resume_tomorrow', {
    title: 'Where did we stop?',
    description: 'Opens the bookmarked book at the bookmarked page and reads it, mentioning the page the child asked for again. '
      + 'If the book was finished, starts it from page one. Use the same `listener` as bookmark_tonight.',
    inputSchema: { listener: z.string().max(40).optional() },
    outputSchema: { ...pageCard, bookmark: z.looseObject({ book: z.string(), page: z.number() }) },
    annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: false },
  }, async (args) => reply(reading.resumeTomorrow(args)));

  server.registerResource('reading', 'storyshelf://reading', {
    title: 'What this reading session remembers', mimeType: 'application/json',
  }, async (uri) => ({ contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(reading.context(), null, 2) }] }));

  server.registerResource('about', 'storyshelf://about', {
    title: 'Where the books come from', mimeType: 'application/json',
  }, async (uri) => ({ contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify({ ...shelf.about, books: shelf.books.length }, null, 2) }] }));

  return server;
}
