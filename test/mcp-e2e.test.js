// End-to-end: start the real server, talk to it with the official MCP client over Streamable HTTP (protocol 2025-11-25).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

let PORT, proc;
const BOOKMARKS = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'storyshelf-e2e-')), 'bookmarks.json');
test.before(async () => {
  proc = spawn(process.execPath, ['src/server.js'], { env: { ...process.env, PORT: '0', BOOKMARKS_FILE: BOOKMARKS }, stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((resolve) => proc.stdout.on('data', (d) => { const m = String(d).match(/on http:\/\/[\d.]+:(\d+)/); if (m) { PORT = +m[1]; resolve(); } }));
});
test.after(() => proc.kill());
const connect = async (name = 'e2e') => {
  const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${PORT}/mcp`));
  const client = new Client({ name, version: '1.0.0' });
  await client.connect(transport);
  return { client, transport };
};

test('initialize negotiates 2025-11-25, lists the six tools, reads a book page by page with "again"', async () => {
  const { client, transport } = await connect();
  assert.equal(transport.protocolVersion, '2025-11-25');
  assert.ok(transport.sessionId, 'server issued a session id');
  assert.match(client.getInstructions(), /Read one page per turn/);
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((t) => t.name).sort(), ['again', 'bookmark_tonight', 'find_book_by_what_is_in_it', 'list_shelf', 'read_page', 'resume_tomorrow']);
  const find = tools.find((t) => t.name === 'find_book_by_what_is_in_it');
  assert.equal(find.annotations.readOnlyHint, true);
  assert.ok(find.outputSchema && tools.find((t) => t.name === 'read_page').outputSchema);

  const f = await client.callTool({ name: 'find_book_by_what_is_in_it', arguments: { words: 'Alexa, read me the dinosaur one!' } });
  assert.ok(!f.isError);
  assert.equal(f.structuredContent.decided, true);
  const slug = f.structuredContent.results[0].slug;
  const p1 = await client.callTool({ name: 'read_page', arguments: { book: slug } });
  assert.equal(p1.structuredContent.page, 1);
  assert.ok(p1.structuredContent.image.startsWith('/media/pages/'));
  assert.ok(p1.structuredContent.audio.sentences.length >= 1);
  const again = await client.callTool({ name: 'again', arguments: {} });
  assert.equal(again.structuredContent.again_count, 1);
  assert.equal(again.structuredContent.speech, p1.structuredContent.text_en);
  const p2 = await client.callTool({ name: 'read_page', arguments: {} });
  assert.equal(p2.structuredContent.page, 2);
  // the page picture and the book's own narration are really served
  for (const url of [p2.structuredContent.image, p2.structuredContent.audio.src, p2.structuredContent.book.cover]) {
    const r = await fetch(`http://127.0.0.1:${PORT}${url}`, { method: 'HEAD' });
    assert.equal(r.status, 200, url);
  }
  const bad = await client.callTool({ name: 'read_page', arguments: { book: 'nope' } });
  assert.ok(bad.isError);
  await client.close();
});

test('rejects foreign browser origins', async () => {
  const r = await fetch(`http://127.0.0.1:${PORT}/mcp`, { method: 'POST', headers: { origin: 'https://evil.example', 'content-type': 'application/json' }, body: '{}' });
  assert.equal(r.status, 403);
});

test('each MCP session is its own reading; a bookmark crosses sessions', async () => {
  const a = (await connect('a')).client, b = (await connect('b')).client;
  await a.callTool({ name: 'read_page', arguments: { book: 'luna-ep01', page: 5 } });
  await a.callTool({ name: 'again', arguments: {} });
  const bNext = await b.callTool({ name: 'read_page', arguments: {} });
  assert.ok(bNext.isError, 'session b has no book open');
  const ctxA = JSON.parse((await a.readResource({ uri: 'storyshelf://reading' })).contents[0].text);
  assert.equal(ctxA.page, 5);
  assert.deepEqual(ctxA.again_counts, { 5: 1 });
  const bm = await a.callTool({ name: 'bookmark_tonight', arguments: { listener: 'Mina' } });
  assert.equal(bm.structuredContent.bookmark.page, 5);
  await a.close();

  const tomorrow = (await connect('tomorrow')).client;
  const none = await tomorrow.callTool({ name: 'resume_tomorrow', arguments: {} });
  assert.ok(none.isError, '"home" has no bookmark');
  const r = await tomorrow.callTool({ name: 'resume_tomorrow', arguments: { listener: 'mina' } });
  assert.ok(!r.isError);
  assert.equal(r.structuredContent.page, 5);
  assert.equal(r.structuredContent.again_count, 1);
  assert.match(r.structuredContent.speech, /^Last time we stopped at page five/);
  assert.equal(JSON.parse(fs.readFileSync(BOOKMARKS, 'utf8')).mina.book, 'luna-ep01');
  const about = JSON.parse((await tomorrow.readResource({ uri: 'storyshelf://about' })).contents[0].text);
  assert.equal(about.books, 11);
  await tomorrow.close(); await b.close();
});
