import { McpHttpClient } from './mcp-client.js';

// Alexa's part is played by a small keyword router: no language model is called anywhere in this demo.
// It decides which MCP tool to call; the server does the finding, reading, counting and remembering.
const EXAMPLES = [
  'Alexa, read me the dinosaur one!',
  'Again!',
  'Next',
  'The one with the whale',
  'The scared one',
  'Bookmark',
  'Where did we stop?',
  'What books do you have?',
];
const NUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, first: 1, second: 2, third: 3, '1st': 1, '2nd': 2, '3rd': 3 };

const $ = (id) => document.getElementById(id);
const state = { books: [], card: null, candidates: [], stopped: false };

// ---------- MCP traffic panel ----------
function summarize(msg) {
  if (msg.note) return msg.note;
  if (msg.method) return msg.method === 'tools/call' ? `${msg.method} → ${msg.params.name}(${JSON.stringify(msg.params.arguments)})` : msg.method;
  const r = msg.result;
  if (!r) return msg.error ? `error: ${msg.error.message}` : 'ok';
  if (r.protocolVersion) return `initialize result · protocol ${r.protocolVersion} · ${r.serverInfo?.title || r.serverInfo?.name}`;
  if (r.tools) return `tools: ${r.tools.map((t) => t.name).join(', ')}`;
  const sc = r.structuredContent;
  if (sc?.page) return `result · ${sc.book.title_en} · page ${sc.page}/${sc.pages}${sc.again_count ? ` · again ×${sc.again_count}` : ''}`;
  if (sc?.results) return `result · ${sc.results.length} match(es)${sc.decided ? ' · decided' : ''} · ${sc.results.slice(0, 3).map((x) => x.slug).join(', ')}`;
  if (sc?.bookmark && sc?.listener) return `result · bookmarked ${sc.bookmark.book} p${sc.bookmark.page} for "${sc.listener}"`;
  if (sc?.speech) return `result · "${sc.speech.slice(0, 60)}${sc.speech.length > 60 ? '…' : ''}"`;
  if (r.isError) return `tool error: ${r.content?.[0]?.text}`;
  return 'result';
}
function onTraffic(dir, msg) {
  const li = document.createElement('li'); li.className = dir;
  const det = document.createElement('details');
  const sum = document.createElement('summary');
  sum.innerHTML = `<span class="dir">${dir === 'out' ? '→' : '←'}</span>`;
  sum.append(document.createTextNode(summarize(msg)));
  const pre = document.createElement('pre'); pre.textContent = JSON.stringify(msg, null, 2);
  det.append(sum, pre); li.append(det); $('log').append(li); li.scrollIntoView({ block: 'end' });
}

// ---------- screen ----------
function show(which) { for (const id of ['idle', 'heard', 'choices', 'page']) $(id).classList.toggle('hidden', id !== which); }
function light(mode) { $('lightbar').className = 'lightbar' + (mode ? ' ' + mode : ''); }
function caption(text) { $('caption').textContent = text; $('caption').classList.toggle('hidden', !text); }
function renderClock() { $('clock').textContent = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date()); }

function renderShelf() {
  $('shelf').innerHTML = '';
  for (const b of state.books) {
    const d = document.createElement('div'); d.className = 'book'; d.title = `${b.title_en} (${b.title_ko})`;
    const img = document.createElement('img'); img.src = b.cover; img.alt = b.title_en;
    const s = document.createElement('span'); s.textContent = b.creatures[0];
    d.append(img, s); $('shelf').append(d);
  }
}
function renderChoices(list) {
  $('choices').innerHTML = '';
  list.forEach((b, i) => {
    const d = document.createElement('div'); d.className = 'choice';
    const img = document.createElement('img'); img.src = b.cover; img.alt = b.title_en;
    const n = document.createElement('div'); n.className = 'num'; n.textContent = i + 1;
    const t = document.createElement('div'); t.className = 't'; t.textContent = b.title_en;
    d.append(img, n, t); $('choices').append(d);
  });
  show('choices');
}
function renderCard(c) {
  state.card = c;
  stopNarration();
  $('page-img').src = c.image;
  $('page-title').textContent = c.book.title_en;
  $('page-no').textContent = `${c.page_spoken} · ${c.book.title_ko}`;
  $('again-chip').textContent = `Again ×${c.again_count}`; $('again-chip').classList.toggle('hidden', !c.again_count);
  $('page-en').textContent = c.text_en;
  // Korean text as sentences, so the book's own narration can highlight them as it plays.
  $('page-ko').innerHTML = '';
  c.audio.sentences.forEach((s, i) => { const sp = document.createElement('span'); sp.className = 's'; sp.dataset.i = i; sp.textContent = s.text + ' '; $('page-ko').append(sp); });
  $('dots').innerHTML = '';
  for (let p = 1; p <= c.pages; p++) { const i = document.createElement('i'); if (p < c.page) i.className = 'done'; if (p === c.page) i.className = c.again_count ? 'now again' : 'now'; $('dots').append(i); }
  $('narration').src = c.audio.src;
  $('voice').classList.remove('on'); $('voice').textContent = "▶ Hear the book's own voice (Korean)";
  show('page');
}

// ---------- the book's own narration (Korean mp3 + sentence timestamps from the publisher) ----------
function stopNarration() { const a = $('narration'); a.pause(); a.currentTime = 0; $('voice').classList.remove('on'); $('voice').textContent = "▶ Hear the book's own voice (Korean)"; highlight(-1); }
function highlight(i) { document.querySelectorAll('#page-ko .s').forEach((el) => el.classList.toggle('now', +el.dataset.i === i)); }
function setupNarration() {
  const a = $('narration');
  $('voice').onclick = () => {
    if (!a.paused) return stopNarration();
    speechSynthesis?.cancel?.();
    a.play(); $('voice').classList.add('on'); $('voice').textContent = '■ Stop';
  };
  a.ontimeupdate = () => {
    const t = a.currentTime; const s = state.card?.audio.sentences || [];
    highlight(s.findIndex((x) => t >= x.start && t < x.end + 0.15));
  };
  a.onended = () => stopNarration();
}

function speak(text) {
  return new Promise((resolve) => {
    if (!$('speak').checked || !('speechSynthesis' in window)) return resolve();
    const u = new SpeechSynthesisUtterance(text);
    const v = speechSynthesis.getVoices().find((x) => /Samantha|Google US English/.test(x.name)) || speechSynthesis.getVoices().find((x) => x.lang === 'en-US');
    if (v) u.voice = v;
    u.onend = resolve; u.onerror = resolve;
    light('talk'); speechSynthesis.speak(u);
  }).finally(() => light(''));
}

// ---------- keyword router: what a child says -> which tool ----------
export function plan(text, ctx = state) {
  const t = text.toLowerCase().replace(/^alexa[,!]?\s*/, '').trim();
  const listener = ($('listener')?.value || 'home').trim() || 'home';
  if (/(what|which) (books|stories)|on the shelf|^list|show me the (shelf|books)/.test(t)) return [['list_shelf', {}]];
  if (/where (did|do) we stop|last night|yesterday|resume|continue|pick up where|keep reading from|the book from/.test(t)) return [['resume_tomorrow', { listener }]];
  if (/bookmark|stop here|enough for tonight|good ?night|save (it|this|that)|we('ll| will) stop/.test(t)) return [['bookmark_tonight', { listener }]];
  if (/^(again|more|encore)[!. ]*$|\bagain\b|one more time|read (that|it) (again|once more)|once more/.test(t)) return [['again', {}]];
  const pg = t.match(/\bpage (\d|one|two|three|four|five|six|seven|eight)\b/);
  if (pg) return [['read_page', { page: NUM[pg[1]] || +pg[1] }]];
  if (ctx.candidates.length) {
    const pick = t.match(/\b(first|second|third|1st|2nd|3rd|one|two|three)\b( one)?/);
    if (pick && /(first|second|third|1st|2nd|3rd|number|the (one|two|three)\b)/.test(t)) return [['read_page', { choice: NUM[pick[1]] }]];
  }
  if (/^(next|and then|keep going|turn the page|what happens next|go on|then what|continue)[?!. ]*$/.test(t) || /\bnext page\b/.test(t)) return [['read_page', {}]];
  return [['find_book_by_what_is_in_it', { words: t }]];
}

async function callTool(name, args) {
  const res = await mcp.callTool(name, args);
  const sc = res.structuredContent;
  if (sc?.page) { state.candidates = []; renderCard(sc); }
  return res;
}

async function ask(text) {
  text = text.trim(); if (!text) return;
  $('heard').textContent = text; show('heard'); caption(''); light('think'); stopNarration();
  const said = [];
  try {
    for (const [tool, args] of plan(text)) {
      const res = await callTool(tool, args);
      if (res.isError) { said.push(res.content?.[0]?.text); continue; }
      const sc = res.structuredContent;
      said.push(sc.speech);
      if (tool === 'find_book_by_what_is_in_it') {
        if (sc.decided) {
          const r = await callTool('read_page', { book: sc.results[0].slug });
          said.push(r.isError ? r.content?.[0]?.text : r.structuredContent.speech);
        } else if (sc.results.length > 1) {
          const top = sc.results.filter((x) => x.score === sc.results[0].score).slice(0, 3);
          state.candidates = top.map((x) => state.books.find((b) => b.slug === x.slug));
          renderChoices(state.candidates);
        }
      }
      if (tool === 'list_shelf') { show('idle'); }
    }
  } catch (e) {
    said.push(`Sorry, something went wrong: ${e.message}`);
  }
  light('');
  if ($('heard').classList.contains('hidden') === false) { show(state.card ? 'page' : 'idle'); }
  const answer = said.filter(Boolean).join(' ');
  caption(answer);
  await speak(answer);
}

// ---------- voice input (Chrome Web Speech API, optional) ----------
function setupMic() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { $('mic').disabled = true; $('mic').title = 'Speech recognition is not available in this browser; type instead.'; return; }
  const rec = new SR(); rec.lang = 'en-US'; rec.interimResults = true;
  rec.onresult = (e) => { const t = [...e.results].map((r) => r[0].transcript).join(''); $('utter').value = t; $('heard').textContent = t; show('heard'); if (e.results[e.results.length - 1].isFinal) ask(t); };
  rec.onend = () => { $('mic').classList.remove('on'); light(''); };
  $('mic').onclick = () => { $('mic').classList.add('on'); light('listen'); rec.start(); };
}

// ---------- boot ----------
const mcp = new McpHttpClient('/mcp', { onTraffic });
async function boot() {
  for (const ex of EXAMPLES) { const b = document.createElement('button'); b.type = 'button'; b.textContent = ex; b.onclick = () => { $('utter').value = ex; ask(ex); }; $('examples').append(b); }
  $('ask').onsubmit = (e) => { e.preventDefault(); ask($('utter').value); $('utter').value = ''; };
  $('new-night').onclick = async () => { state.card = null; state.candidates = []; stopNarration(); show('idle'); caption(''); await mcp.reset(); };
  renderClock(); setInterval(renderClock, 15000); setupMic(); setupNarration();

  const init = await mcp.connect();
  $('b-proto').textContent = `MCP ${init.protocolVersion} · Streamable HTTP · ${init.serverInfo.title}`; $('b-proto').classList.add('ok');
  state.tools = (await mcp.listTools()).tools;
  const shelf = await mcp.callTool('list_shelf', {});
  state.books = shelf.structuredContent.books;
  renderShelf();
  const cfg = await fetch('/api/config').then((r) => r.json());
  $('credits').textContent = `${cfg.books} sample picture books by Dongwhamoa (MoaHub). ${cfg.about.narration} English page text written for this demo (AI-assisted, edited); not machine-translated.`;
  window.storyshelf = { ask, plan, state, mcp };
}
boot();
