// Read Me the Dinosaur One: MCP server (Streamable HTTP, protocol 2025-11-25) + the web simulator that plays the Alexa+ side.
import express from 'express';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { createMcpServer } from './mcp.js';
import { Shelf } from './shelf.js';
import { Bookmarks } from './bookmarks.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PORT = +(process.env.PORT || 8790);
const HOST = process.env.HOST || '127.0.0.1';

const shelf = Shelf.load();
const bookmarks = new Bookmarks(process.env.BOOKMARKS_FILE || undefined);
const app = express();
app.use(express.json({ limit: '1mb' }));

// Only accept browser requests from this page (DNS-rebinding protection for a local server).
app.use('/mcp', (req, res, next) => {
  const origin = req.headers.origin;
  const port = httpServer.address().port;
  const allowed = (process.env.ALLOWED_ORIGINS || `http://localhost:${port},http://127.0.0.1:${port}`).split(',');
  if (origin && !allowed.includes(origin)) return res.status(403).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Origin not allowed' }, id: null });
  res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id, Mcp-Protocol-Version');
  next();
});

// One MCP session = one reading session. The transport is created on `initialize` and kept until DELETE.
const sessions = new Map();
app.post('/mcp', async (req, res) => {
  const sid = req.headers['mcp-session-id'];
  let transport = sid && sessions.get(sid);
  if (!transport) {
    if (sid || !isInitializeRequest(req.body)) {
      return res.status(400).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Bad Request: no valid session' }, id: null });
    }
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (id) => sessions.set(id, transport),
    });
    transport.onclose = () => transport.sessionId && sessions.delete(transport.sessionId);
    await createMcpServer(shelf, bookmarks).connect(transport);
  }
  await transport.handleRequest(req, res, req.body);
});
const bySession = async (req, res) => {
  const t = sessions.get(req.headers['mcp-session-id']);
  if (!t) return res.status(400).send('Invalid or missing session id');
  await t.handleRequest(req, res);
};
app.get('/mcp', bySession);
app.delete('/mcp', bySession);

app.get('/api/config', (req, res) => res.json({ books: shelf.books.length, about: shelf.about, bookmarks: Object.keys(bookmarks.all()) }));
app.use('/media', express.static(path.resolve(HERE, '../data/media'), { maxAge: '1h' }));
app.use(express.static(path.resolve(HERE, '../web')));

const httpServer = app.listen(PORT, HOST, () => {
  console.log(`Read Me the Dinosaur One on http://${HOST}:${httpServer.address().port}  (MCP endpoint /mcp; ${shelf.books.length} books)`);
});
