// Spectator server: a tiny HTTP + Server-Sent-Events server the MCP can start on demand so a human can watch
// the agent play live in a browser. Serves the built game (dist/) and streams state snapshots to /events.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface ToolCall {
  t: number; // ms since epoch
  name: string;
  args: string;
  ok: boolean;
  note?: string;
}

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

export class Spectator {
  private server: Server | null = null;
  private clients = new Set<ServerResponse>();
  private lastPayload = '';
  port = 0;
  speed = 10; // game seconds per real second while ticking
  toolLog: ToolCall[] = [];
  /** Producer of the snapshot object (set by the MCP server). */
  snapshot: () => unknown = () => ({});

  get running() {
    return !!this.server;
  }

  get url() {
    return this.server ? `http://localhost:${this.port}/spectate/` : null;
  }

  /** Where the built site lives: <repo>/dist next to mcp/dist/index.mjs. */
  static distDir(): string {
    const here = dirname(fileURLToPath(import.meta.url));
    for (const cand of [join(here, '..', '..', 'dist'), join(here, '..', 'dist'), join(process.cwd(), 'dist')]) {
      if (existsSync(join(cand, 'spectate', 'index.html'))) return cand;
    }
    return join(here, '..', '..', 'dist');
  }

  start(port = 7411, speed = 10): Promise<string> {
    this.speed = speed;
    if (this.server) return Promise.resolve(this.url!);
    const dist = Spectator.distDir();
    if (!existsSync(join(dist, 'spectate', 'index.html'))) {
      return Promise.reject(new Error(`built site not found at ${dist}. Run "npm run build" in the PlanetEscape folder first.`));
    }
    return new Promise((resolve, reject) => {
      const srv = createServer((req, res) => this.handle(req, res, dist));
      srv.on('error', (e) => {
        this.server = null;
        reject(e);
      });
      srv.listen(port, '127.0.0.1', () => {
        this.server = srv;
        this.port = port;
        resolve(this.url!);
      });
    });
  }

  stop() {
    for (const c of this.clients) c.end();
    this.clients.clear();
    this.server?.close();
    this.server = null;
  }

  private handle(req: IncomingMessage, res: ServerResponse, dist: string) {
    const url = new URL(req.url ?? '/', 'http://localhost');
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (url.pathname === '/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      res.write(': connected\n\n');
      if (!this.lastPayload) this.lastPayload = JSON.stringify(this.snapshot());
      res.write(`data: ${this.lastPayload}\n\n`);
      this.clients.add(res);
      req.on('close', () => this.clients.delete(res));
      return;
    }
    if (url.pathname === '/state') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(this.snapshot()));
      return;
    }
    let p = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
    if (p === '/' || p === '\\') p = '/spectate/index.html';
    let file = join(dist, p);
    if (!file.startsWith(dist)) {
      res.writeHead(403).end();
      return;
    }
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    if (!existsSync(file)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(readFileSync(file));
  }

  /** Push the current snapshot to every connected browser. */
  broadcast() {
    if (!this.server) return;
    this.lastPayload = JSON.stringify(this.snapshot());
    const msg = `data: ${this.lastPayload}\n\n`;
    for (const c of this.clients) c.write(msg);
  }

  record(call: ToolCall) {
    this.toolLog.push(call);
    if (this.toolLog.length > 60) this.toolLog.shift();
  }
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
