// Smoke test: drives the MCP server over stdio like an AI client would.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const client = new Client({ name: 'pe-test', version: '1.0.0' });
await client.connect(new StdioClientTransport({ command: 'node', args: ['mcp/dist/index.mjs'] }));
const tools = await client.listTools();
console.log('tools:', tools.tools.map((t) => t.name).join(', '));
const call = async (name, args = {}) => {
  const r = await client.callTool({ name, arguments: args });
  if (r.isError) throw new Error(`${name}: ${r.content[0].text}`);
  return r.structuredContent ?? JSON.parse(r.content[0].text);
};

// Chapter 1: solve automatically
let s = await call('pe_new_game', { mode: 'story', chapter: 1 });
console.log('chapter', s.chapter, 'order', s.order.id, 'map', s.map.width);
const map = await call('pe_map', { w: 20, h: 12 });
console.log(map.map.split('\n').slice(0, 4).join('\n'), '...');
let sol = await call('pe_solve_order', { rate_per_min: 10 });
console.log('solve ch1:', sol.ok, sol.steps, sol.error ?? '');
let t = await call('pe_tick', { seconds: 120 });
console.log('after tick:', t.secondsRun, 's, events:', t.events, 'order now', t.state.order?.index, 'problems', t.problems.length);

// playbook + next chapter (carries over from the completed chapter 1)
const pb = await client.callTool({ name: 'pe_playbook', arguments: {} });
console.log('playbook chars:', pb.content[0].text.length);
const prompts = await client.listPrompts();
console.log('prompts:', prompts.prompts.map((p) => p.name).join(', '));
s = await call('pe_next_chapter');
console.log('next chapter ->', s.chapter, 'order', s.state.order?.id, 'inventory', JSON.stringify(s.state.inventory));

// Chapter 2: plates from iron + copper
s = await call('pe_new_game', { mode: 'story', chapter: 2 });
sol = await call('pe_solve_order', { rate_per_min: 12 });
console.log('solve ch2:', sol.ok, sol.steps.length, 'steps', sol.error ?? '');
t = await call('pe_tick', { seconds: 400 });
console.log('ch2 after tick:', t.secondsRun, 's events', t.events, 'order', JSON.stringify(t.state.order?.deliver));

// Chapter 3: printer + machine parts
s = await call('pe_new_game', { mode: 'story', chapter: 3 });
const early = await client.callTool({ name: 'pe_next_chapter', arguments: {} });
console.log('next chapter while order open -> isError', early.isError, early.content[0].text.slice(0, 60));
sol = await call('pe_solve_order', { rate_per_min: 6 });
console.log('solve ch3:', sol.ok, sol.steps, sol.error ?? '');
t = await call('pe_tick', { seconds: 600 });
console.log('ch3 after tick:', t.secondsRun, 's events', t.events, 'order', JSON.stringify(t.state.order));
const an = await call('pe_analyze');
console.log('problems:', an.problems.slice(0, 5).map((p) => p.status + '@' + p.building.type + '(' + p.building.x + ',' + p.building.y + ')' + (p.missing ? ' missing ' + p.missing : '')));

// free play: plan + chain for circuits
s = await call('pe_new_game', { mode: 'free', seed: 7, allUnlocked: true, mapSize: 'small' });
const plan = await call('pe_plan', { item: 'circuit', rate_per_min: 20 });
console.log('plan circuit 20/min:', plan.steps.map((r) => `${r.item}:${r.machines}x${r.machine}`).join(' | '));
const ch = await call('pe_build_chain', { item: 'circuit', rate_per_min: 20 });
console.log('chain circuit:', ch.ok, ch.placedCount, ch.error ?? '');
t = await call('pe_tick', { seconds: 240, stop_on_order: false });
console.log('free after tick: circuits in core =', t.state.inventory.circuit ?? 0, 'problems', t.problems.length);
const exp = await call('pe_save', { action: 'export' });
console.log('export bytes', exp.json.length);
await client.close();
console.log('done');
