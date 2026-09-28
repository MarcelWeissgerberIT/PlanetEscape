// A small CHIP-8 virtual machine (the classic 8-bit game VM from 1977) plus a two-pass assembler.
// Used by the KORA Terminal building: programs written in the in-game editor run on the factory's power
// and draw on a 64x32 display made of LED lamps.

export const CHIP8_W = 64;
export const CHIP8_H = 32;
const PROGRAM_START = 0x200;

const FONT = [
  0xf0, 0x90, 0x90, 0x90, 0xf0, 0x20, 0x60, 0x20, 0x20, 0x70, 0xf0, 0x10, 0xf0, 0x80, 0xf0, 0xf0, 0x10, 0xf0, 0x10, 0xf0,
  0x90, 0x90, 0xf0, 0x10, 0x10, 0xf0, 0x80, 0xf0, 0x10, 0xf0, 0xf0, 0x80, 0xf0, 0x90, 0xf0, 0xf0, 0x10, 0x20, 0x40, 0x40,
  0xf0, 0x90, 0xf0, 0x90, 0xf0, 0xf0, 0x90, 0xf0, 0x10, 0xf0, 0xf0, 0x90, 0xf0, 0x90, 0x90, 0xe0, 0x90, 0xe0, 0x90, 0xe0,
  0xf0, 0x80, 0x80, 0x80, 0xf0, 0xe0, 0x90, 0x90, 0x90, 0xe0, 0xf0, 0x80, 0xf0, 0x80, 0xf0, 0xf0, 0x80, 0xf0, 0x80, 0x80,
];

export class Chip8 {
  mem = new Uint8Array(4096);
  v = new Uint8Array(16);
  i = 0;
  pc = PROGRAM_START;
  stack: number[] = [];
  dt = 0;
  st = 0;
  display = new Uint8Array(CHIP8_W * CHIP8_H);
  keys = new Uint8Array(16);
  waitingKey = -1; // register waiting for a key press (Fx0A), -1 = none
  dirty = true;
  /** set when the program reads the delay timer or waits for a key: a good moment to show the frame (no tearing) */
  syncHint = false;
  halted: string | null = null; // error text when the program crashed
  cycles = 0;
  /** installed memory in bytes; accesses beyond it halt the machine (missing RAM bank) */
  memLimit = 4096;
  readonly romLength: number;
  private rom: Uint8Array;
  private rnd = 0x12345678;

  constructor(rom: Uint8Array) {
    this.rom = rom;
    this.romLength = rom.length;
    this.reset();
  }

  reset() {
    this.mem.fill(0);
    this.mem.set(FONT, 0);
    this.mem.set(this.rom.subarray(0, 4096 - PROGRAM_START), PROGRAM_START);
    this.v.fill(0);
    this.i = 0;
    this.pc = PROGRAM_START;
    this.stack = [];
    this.dt = 0;
    this.st = 0;
    this.display.fill(0);
    this.keys.fill(0);
    this.waitingKey = -1;
    this.dirty = true;
    this.syncHint = true;
    this.halted = null;
    this.cycles = 0;
  }

  private random(): number {
    // xorshift32: deterministic, so a save reloads to the same game
    let x = this.rnd;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.rnd = x >>> 0;
    return this.rnd & 0xff;
  }

  /** 60 Hz timers; call once per 1/60 s. Returns true when the buzzer should sound. */
  tickTimers(): boolean {
    if (this.dt > 0) this.dt--;
    if (this.st > 0) {
      this.st--;
      return true;
    }
    return false;
  }

  keyDown(k: number) {
    this.keys[k & 15] = 1;
    if (this.waitingKey === -2) this.waitingKey = -1; // parked (idle loop): a key wakes it up
    if (this.waitingKey >= 0) {
      this.v[this.waitingKey] = k & 15;
      this.waitingKey = -1;
    }
  }

  keyUp(k: number) {
    this.keys[k & 15] = 0;
  }

  /** Execute up to n instructions. */
  run(n: number) {
    for (let c = 0; c < n; c++) {
      if (this.halted || this.waitingKey >= 0) return;
      this.step();
    }
  }

  /** Like run, but stops early right after a frame sync point (timer read) once at least `min` instructions ran. */
  runFrame(n: number, min: number) {
    for (let c = 0; c < n; c++) {
      if (this.halted || this.waitingKey >= 0) return c;
      this.syncHint = false;
      this.step();
      if (this.syncHint && c >= min) return c + 1;
    }
    return n;
  }

  step() {
    const pc = this.pc;
    if (pc < 0 || pc > 4094) {
      this.halted = `pc out of range: ${pc.toString(16)}`;
      return;
    }
    if (pc + 1 >= this.memLimit) {
      this.halted = `memory at 0x${pc.toString(16).toUpperCase()} missing`;
      return;
    }
    const op = (this.mem[pc] << 8) | this.mem[pc + 1];
    this.pc = pc + 2;
    this.cycles++;
    const x = (op >> 8) & 0xf, y = (op >> 4) & 0xf, n = op & 0xf, nn = op & 0xff, nnn = op & 0xfff;
    const v = this.v;
    switch (op >> 12) {
      case 0x0:
        if (op === 0x00e0) {
          this.display.fill(0);
          this.dirty = true;
          this.syncHint = false;
        } else if (op === 0x00ee) {
          if (!this.stack.length) {
            this.halted = 'RET with empty stack';
            return;
          }
          this.pc = this.stack.pop()!;
        } else if (op === 0x0000) {
          this.halted = 'reached empty memory (0000)';
        }
        // other 0nnn (machine code) is ignored
        break;
      case 0x1:
        if (nnn === pc) {
          // jump to self: idle loop, treat as halt without error
          this.pc = pc;
          this.halted = null;
          this.waitingKey = -2; // parks the machine
          return;
        }
        this.pc = nnn;
        break;
      case 0x2:
        if (this.stack.length >= 16) {
          this.halted = 'stack overflow';
          return;
        }
        this.stack.push(this.pc);
        this.pc = nnn;
        break;
      case 0x3:
        if (v[x] === nn) this.pc += 2;
        break;
      case 0x4:
        if (v[x] !== nn) this.pc += 2;
        break;
      case 0x5:
        if (v[x] === v[y]) this.pc += 2;
        break;
      case 0x6:
        v[x] = nn;
        break;
      case 0x7:
        v[x] = (v[x] + nn) & 0xff;
        break;
      case 0x8:
        switch (n) {
          case 0x0: v[x] = v[y]; break;
          case 0x1: v[x] |= v[y]; break;
          case 0x2: v[x] &= v[y]; break;
          case 0x3: v[x] ^= v[y]; break;
          case 0x4: {
            const s = v[x] + v[y];
            v[x] = s & 0xff;
            v[0xf] = s > 0xff ? 1 : 0;
            break;
          }
          case 0x5: {
            const f = v[x] >= v[y] ? 1 : 0;
            v[x] = (v[x] - v[y]) & 0xff;
            v[0xf] = f;
            break;
          }
          case 0x6: {
            const f = v[x] & 1;
            v[x] >>= 1;
            v[0xf] = f;
            break;
          }
          case 0x7: {
            const f = v[y] >= v[x] ? 1 : 0;
            v[x] = (v[y] - v[x]) & 0xff;
            v[0xf] = f;
            break;
          }
          case 0xe: {
            const f = (v[x] >> 7) & 1;
            v[x] = (v[x] << 1) & 0xff;
            v[0xf] = f;
            break;
          }
          default:
            this.halted = `bad opcode ${op.toString(16)}`;
        }
        break;
      case 0x9:
        if (v[x] !== v[y]) this.pc += 2;
        break;
      case 0xa:
        this.i = nnn;
        break;
      case 0xb:
        this.pc = (nnn + v[0]) & 0xfff;
        break;
      case 0xc:
        v[x] = this.random() & nn;
        break;
      case 0xd: {
        if (this.i + n > this.memLimit) {
          this.halted = `memory at 0x${(this.i + n).toString(16).toUpperCase()} missing`;
          return;
        }
        // sprite: n rows of 8 pixels at (Vx, Vy), XOR drawn, VF = collision, wraps around the edges
        const px = v[x] % CHIP8_W, py = v[y] % CHIP8_H;
        v[0xf] = 0;
        for (let row = 0; row < n; row++) {
          const bits = this.mem[(this.i + row) & 0xfff];
          const yy = (py + row) % CHIP8_H;
          for (let col = 0; col < 8; col++) {
            if (!(bits & (0x80 >> col))) continue;
            const xx = (px + col) % CHIP8_W;
            const idx = yy * CHIP8_W + xx;
            if (this.display[idx]) v[0xf] = 1;
            this.display[idx] ^= 1;
          }
        }
        this.dirty = true;
        this.syncHint = false;
        break;
      }
      case 0xe:
        if (nn === 0x9e) {
          if (this.keys[v[x] & 15]) this.pc += 2;
        } else if (nn === 0xa1) {
          if (!this.keys[v[x] & 15]) this.pc += 2;
        } else this.halted = `bad opcode ${op.toString(16)}`;
        break;
      case 0xf:
        switch (nn) {
          case 0x07:
            v[x] = this.dt;
            this.syncHint = true;
            break;
          case 0x0a:
            this.waitingKey = x;
            this.syncHint = true;
            break;
          case 0x15: this.dt = v[x]; break;
          case 0x18: this.st = v[x]; break;
          case 0x1e: this.i = (this.i + v[x]) & 0xfff; break;
          case 0x29: this.i = (v[x] & 15) * 5; break;
          case 0x33: {
            const val = v[x];
            this.mem[this.i & 0xfff] = Math.floor(val / 100);
            this.mem[(this.i + 1) & 0xfff] = Math.floor(val / 10) % 10;
            this.mem[(this.i + 2) & 0xfff] = val % 10;
            break;
          }
          case 0x55:
          case 0x65:
            if (this.i + x >= this.memLimit) {
              this.halted = `memory at 0x${(this.i + x).toString(16).toUpperCase()} missing`;
              return;
            }
            if (nn === 0x55) for (let k = 0; k <= x; k++) this.mem[(this.i + k) & 0xfff] = v[k];
            else for (let k = 0; k <= x; k++) v[k] = this.mem[(this.i + k) & 0xfff];
            break;
          default:
            this.halted = `bad opcode ${op.toString(16)}`;
        }
        break;
    }
  }
}

/** Human readable form of one opcode (for the trace panel). */
export function disasm(op: number): string {
  const x = (op >> 8) & 0xf, y = (op >> 4) & 0xf, n = op & 0xf, nn = op & 0xff, nnn = op & 0xfff;
  const h = (v: number, w = 2) => '0x' + v.toString(16).toUpperCase().padStart(w, '0');
  const R = (r: number) => 'V' + r.toString(16).toUpperCase();
  switch (op >> 12) {
    case 0x0: return op === 0x00e0 ? 'CLS' : op === 0x00ee ? 'RET' : `SYS ${h(nnn, 3)}`;
    case 0x1: return `JP ${h(nnn, 3)}`;
    case 0x2: return `CALL ${h(nnn, 3)}`;
    case 0x3: return `SE ${R(x)}, ${h(nn)}`;
    case 0x4: return `SNE ${R(x)}, ${h(nn)}`;
    case 0x5: return `SE ${R(x)}, ${R(y)}`;
    case 0x6: return `LD ${R(x)}, ${h(nn)}`;
    case 0x7: return `ADD ${R(x)}, ${h(nn)}`;
    case 0x8: return `${['LD', 'OR', 'AND', 'XOR', 'ADD', 'SUB', 'SHR', 'SUBN', '?', '?', '?', '?', '?', '?', 'SHL', '?'][n]} ${R(x)}, ${R(y)}`;
    case 0x9: return `SNE ${R(x)}, ${R(y)}`;
    case 0xa: return `LD I, ${h(nnn, 3)}`;
    case 0xb: return `JP V0, ${h(nnn, 3)}`;
    case 0xc: return `RND ${R(x)}, ${h(nn)}`;
    case 0xd: return `DRW ${R(x)}, ${R(y)}, ${n}`;
    case 0xe: return nn === 0x9e ? `SKP ${R(x)}` : nn === 0xa1 ? `SKNP ${R(x)}` : '?';
    case 0xf:
      return nn === 0x07 ? `LD ${R(x)}, DT` : nn === 0x0a ? `LD ${R(x)}, K` : nn === 0x15 ? `LD DT, ${R(x)}` : nn === 0x18 ? `LD ST, ${R(x)}` : nn === 0x1e ? `ADD I, ${R(x)}` : nn === 0x29 ? `LD F, ${R(x)}` : nn === 0x33 ? `LD B, ${R(x)}` : nn === 0x55 ? `LD [I], ${R(x)}` : nn === 0x65 ? `LD ${R(x)}, [I]` : '?';
  }
  return '?';
}

// ---------- Assembler ----------

export interface AsmResult {
  rom: Uint8Array;
  errors: string[];
  labels: Record<string, number>;
}

const REG = /^V([0-9A-F])$/i;

function parseNum(tok: string, labels: Record<string, number> | null): number | null {
  const t = tok.trim();
  if (/^0X[0-9A-F]+$/i.test(t)) return parseInt(t.slice(2), 16);
  if (/^#[0-9A-F]+$/i.test(t)) return parseInt(t.slice(1), 16);
  if (/^\$[0-9A-F]+$/i.test(t)) return parseInt(t.slice(1), 16);
  if (/^%[01]+$/.test(t)) return parseInt(t.slice(1), 2);
  if (/^-?\d+$/.test(t)) return parseInt(t, 10) & 0xffff;
  if (labels && t in labels) return labels[t];
  return null;
}

/**
 * Assemble classic CHIP-8 mnemonics (Cowgod syntax): CLS, RET, JP addr, JP V0,addr, CALL addr, SE/SNE Vx,byte|Vy,
 * LD/ADD/OR/AND/XOR/SUB/SHR/SUBN/SHL, LD I,addr, RND Vx,byte, DRW Vx,Vy,n, SKP/SKNP Vx, LD Vx,DT / LD DT,Vx / LD ST,Vx /
 * LD Vx,K / ADD I,Vx / LD F,Vx / LD B,Vx / LD [I],Vx / LD Vx,[I]. Labels end with ':', `DB` emits bytes, `;` starts a
 * comment, numbers are decimal, 0x.., #.., $.. or %binary. A source that is only hex digit pairs is loaded as raw bytes.
 */
export function assemble(source: string): AsmResult {
  const errors: string[] = [];
  const labels: Record<string, number> = {};
  const clean = source.replace(/\r/g, '');
  const stripped = clean.replace(/;.*$/gm, '').trim();
  if (/^(HEX\s+)?([0-9A-Fa-f]{2}\s*)+$/.test(stripped)) {
    const hex = stripped.replace(/^HEX\s+/, '').replace(/\s+/g, '');
    const rom = new Uint8Array(hex.length / 2);
    for (let k = 0; k < rom.length; k++) rom[k] = parseInt(hex.substr(k * 2, 2), 16);
    return { rom, errors, labels };
  }
  const lines = clean.split('\n');
  type Item = { line: number; text: string; addr: number; size: number };
  const items: Item[] = [];
  let addr = PROGRAM_START;
  // pass 1: addresses and labels
  lines.forEach((raw, li) => {
    let text = raw.replace(/;.*$/, '').trim();
    if (!text) return;
    const lab = text.match(/^([A-Za-z_][\w]*)\s*:\s*(.*)$/);
    if (lab) {
      labels[lab[1]] = addr;
      text = lab[2].trim();
      if (!text) return;
    }
    const size = /^DB\b/i.test(text) ? text.slice(2).split(',').filter((s) => s.trim()).length : 2;
    items.push({ line: li + 1, text, addr, size });
    addr += size;
  });
  const out: number[] = [];
  const err = (it: Item, msg: string) => errors.push(`line ${it.line}: ${msg} (${it.text})`);
  const reg = (tok: string, it: Item): number => {
    const m = tok.trim().match(REG);
    if (!m) {
      err(it, `register expected, got "${tok.trim()}"`);
      return 0;
    }
    return parseInt(m[1], 16);
  };
  const num = (tok: string, it: Item, max: number): number => {
    const n = parseNum(tok, labels);
    if (n === null) {
      err(it, `number or label expected, got "${tok.trim()}"`);
      return 0;
    }
    if (n < 0 || n > max) err(it, `value ${n} out of range (max ${max})`);
    return n & max;
  };
  const isReg = (tok: string) => REG.test(tok.trim());
  for (const it of items) {
    const [mn, ...rest] = it.text.split(/\s+/);
    const op = mn.toUpperCase();
    const args = rest.join(' ').split(',').map((s) => s.trim()).filter((s) => s.length);
    const emit = (w: number) => out.push((w >> 8) & 0xff, w & 0xff);
    const a0 = args[0] ?? '', a1 = args[1] ?? '', a2 = args[2] ?? '';
    const A0 = a0.toUpperCase(), A1 = a1.toUpperCase();
    switch (op) {
      case 'DB':
        for (const a of args) out.push(num(a, it, 0xff));
        break;
      case 'CLS': emit(0x00e0); break;
      case 'RET': emit(0x00ee); break;
      case 'SYS': emit(num(a0, it, 0xfff)); break;
      case 'JP':
        if (A0 === 'V0' && a1) emit(0xb000 | num(a1, it, 0xfff));
        else emit(0x1000 | num(a0, it, 0xfff));
        break;
      case 'CALL': emit(0x2000 | num(a0, it, 0xfff)); break;
      case 'SE':
        if (isReg(a1)) emit(0x5000 | (reg(a0, it) << 8) | (reg(a1, it) << 4));
        else emit(0x3000 | (reg(a0, it) << 8) | num(a1, it, 0xff));
        break;
      case 'SNE':
        if (isReg(a1)) emit(0x9000 | (reg(a0, it) << 8) | (reg(a1, it) << 4));
        else emit(0x4000 | (reg(a0, it) << 8) | num(a1, it, 0xff));
        break;
      case 'LD':
        if (A0 === 'I') emit(0xa000 | num(a1, it, 0xfff));
        else if (A0 === 'DT') emit(0xf015 | (reg(a1, it) << 8));
        else if (A0 === 'ST') emit(0xf018 | (reg(a1, it) << 8));
        else if (A0 === 'F') emit(0xf029 | (reg(a1, it) << 8));
        else if (A0 === 'B') emit(0xf033 | (reg(a1, it) << 8));
        else if (A0 === '[I]') emit(0xf055 | (reg(a1, it) << 8));
        else if (A1 === 'DT') emit(0xf007 | (reg(a0, it) << 8));
        else if (A1 === 'K') emit(0xf00a | (reg(a0, it) << 8));
        else if (A1 === '[I]') emit(0xf065 | (reg(a0, it) << 8));
        else if (isReg(a1)) emit(0x8000 | (reg(a0, it) << 8) | (reg(a1, it) << 4));
        else emit(0x6000 | (reg(a0, it) << 8) | num(a1, it, 0xff));
        break;
      case 'ADD':
        if (A0 === 'I') emit(0xf01e | (reg(a1, it) << 8));
        else if (isReg(a1)) emit(0x8004 | (reg(a0, it) << 8) | (reg(a1, it) << 4));
        else emit(0x7000 | (reg(a0, it) << 8) | num(a1, it, 0xff));
        break;
      case 'OR': emit(0x8001 | (reg(a0, it) << 8) | (reg(a1, it) << 4)); break;
      case 'AND': emit(0x8002 | (reg(a0, it) << 8) | (reg(a1, it) << 4)); break;
      case 'XOR': emit(0x8003 | (reg(a0, it) << 8) | (reg(a1, it) << 4)); break;
      case 'SUB': emit(0x8005 | (reg(a0, it) << 8) | (reg(a1, it) << 4)); break;
      case 'SHR': emit(0x8006 | (reg(a0, it) << 8) | ((a1 ? reg(a1, it) : 0) << 4)); break;
      case 'SUBN': emit(0x8007 | (reg(a0, it) << 8) | (reg(a1, it) << 4)); break;
      case 'SHL': emit(0x800e | (reg(a0, it) << 8) | ((a1 ? reg(a1, it) : 0) << 4)); break;
      case 'RND': emit(0xc000 | (reg(a0, it) << 8) | num(a1, it, 0xff)); break;
      case 'DRW': emit(0xd000 | (reg(a0, it) << 8) | (reg(a1, it) << 4) | num(a2, it, 0xf)); break;
      case 'SKP': emit(0xe09e | (reg(a0, it) << 8)); break;
      case 'SKNP': emit(0xe0a1 | (reg(a0, it) << 8)); break;
      default:
        err(it, `unknown instruction "${mn}"`);
        emit(0);
    }
  }
  return { rom: new Uint8Array(out), errors, labels };
}
