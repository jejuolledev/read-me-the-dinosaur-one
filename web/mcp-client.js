// A small, readable MCP client for the browser: JSON-RPC 2.0 over Streamable HTTP
// (protocol revision 2025-11-25). Every message is reported to `onTraffic` so the
// simulator can show exactly what goes over the wire. (Shell shared with my other entry, Gotta Go.)
export class McpHttpClient {
  constructor(url, { onTraffic = () => {} } = {}) {
    this.url = url; this.onTraffic = onTraffic; this.nextId = 1; this.sessionId = null; this.protocolVersion = null;
  }

  async #post(message) {
    const headers = { 'content-type': 'application/json', accept: 'application/json, text/event-stream' };
    if (this.sessionId) headers['mcp-session-id'] = this.sessionId;
    if (this.protocolVersion) headers['mcp-protocol-version'] = this.protocolVersion;
    this.onTraffic('out', message);
    const res = await fetch(this.url, { method: 'POST', headers, body: JSON.stringify(message) });
    const sid = res.headers.get('mcp-session-id');
    if (sid) this.sessionId = sid;
    if (res.status === 202) return null; // notification accepted
    const type = res.headers.get('content-type') || '';
    let reply = null;
    if (type.includes('text/event-stream')) {
      const text = await res.text();
      for (const block of text.split(/\n\n/)) {
        const data = block.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).join('\n');
        if (!data) continue;
        const msg = JSON.parse(data);
        if (msg.id === message.id) reply = msg; else this.onTraffic('in', msg);
      }
    } else {
      reply = await res.json();
    }
    if (reply) this.onTraffic('in', reply);
    if (reply?.error) throw new Error(reply.error.message);
    return reply?.result;
  }

  request(method, params) { return this.#post({ jsonrpc: '2.0', id: this.nextId++, method, params }); }
  notify(method, params) { return this.#post({ jsonrpc: '2.0', method, ...(params ? { params } : {}) }); }

  async connect() {
    const result = await this.request('initialize', {
      protocolVersion: '2025-11-25',
      capabilities: {},
      clientInfo: { name: 'storyshelf-alexa-simulator', title: 'Alexa+ simulator (Read Me the Dinosaur One)', version: '0.1.0' },
    });
    this.protocolVersion = result.protocolVersion;
    this.serverInfo = result.serverInfo; this.instructions = result.instructions;
    await this.notify('notifications/initialized');
    return result;
  }
  // End this session (tonight's reading) and open a fresh one (another night).
  async reset() {
    if (this.sessionId) {
      this.onTraffic('out', { note: 'DELETE /mcp (end session)' });
      await fetch(this.url, { method: 'DELETE', headers: { 'mcp-session-id': this.sessionId, 'mcp-protocol-version': this.protocolVersion } }).catch(() => {});
    }
    this.sessionId = null; this.protocolVersion = null;
    return this.connect();
  }
  listTools() { return this.request('tools/list', {}); }
  callTool(name, args) { return this.request('tools/call', { name, arguments: args }); }
  readResource(uri) { return this.request('resources/read', { uri }); }
}
