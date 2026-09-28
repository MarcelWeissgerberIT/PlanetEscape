// Built-in programs for the KORA Terminal, written for the in-game assembler (see chip8.ts).
export interface Chip8Program {
  id: string;
  name: string;
  keys: string; // human hint
  source: string;
}


/** 128 view directions as (8*cos, 8*sin) signed bytes, y down. */
function dirTable(): string {
  const rows: string[] = [];
  for (let d = 0; d < 128; d += 8) {
    const parts: string[] = [];
    for (let k = d; k < d + 8; k++) {
      const a = (k / 128) * Math.PI * 2;
      const dx = Math.round(8 * Math.cos(a)) & 0xff, dy = Math.round(8 * Math.sin(a)) & 0xff;
      parts.push('0x' + dx.toString(16).toUpperCase().padStart(2, '0'), '0x' + dy.toString(16).toUpperCase().padStart(2, '0'));
    }
    rows.push('  DB ' + parts.join(', '));
  }
  return rows.join('\n');
}

/** The maze: # wall, . floor, D the exit door; 16x16, one byte per cell. */
export const RAY_MAP = [
  '################',
  '#..............#',
  '#.####.#####.#.#',
  '#.#..#.....#.#.#',
  '#.#..#.###.#.#.#',
  '#.#....#...#...#',
  '#.######.#####.#',
  '#........#.....#',
  '######.#.#.###.#',
  '#......#.#...#.#',
  '#.######.###.#.#',
  '#.#........#.#.#',
  '#.#.######.#.#.#',
  '#.#......#...#D#',
  '#...####.#####.#',
  '################',
];
function mapTable(): string {
  return RAY_MAP.map((row) => '  DB ' + [...row].map((c) => (c === '#' ? '1' : c === 'D' ? '2' : '0')).join(', ')).join('\n');
}

const RAY_SOURCE = `; KORA RAY: a first-person corridor in 64x32, Wolfenstein style.
; 32 rays per frame, half a cell per step, 128 view directions, 4.4 fixed point positions.
; Keys: 5 = forward, 8 = back, 7 = turn left, 9 = turn right, 6 = fire (keyboard W S A D E). Walk into the striped door.
start:
  LD V2, 0x18      ; x = cell 1 + 8/16
  LD V3, 0x18      ; y
  LD V4, 0         ; view direction 0..127, 0 = east
  LD VD, 0         ; muzzle flash frames
  LD VE, 0         ; frame counter
loop:
  CLS
  ADD VE, 1
  LD V0, 7
  SKNP V0
  CALL tleft
  LD V0, 9
  SKNP V0
  CALL tright
  LD V0, 5
  SKNP V0
  CALL fwd
  LD V0, 8
  SKNP V0
  CALL back
  LD V0, 6
  SKNP V0
  CALL fire
  LD V5, 0         ; column 0..31
col:
  LD V0, V4
  ADD V0, V5
  ADD V0, 0xF0     ; ray = view + column - 16 (90 degrees field of view)
  LD V1, 0x7F
  AND V0, V1
  ADD V0, V0
  LD I, dirs
  ADD I, V0
  LD V1, [I]       ; V0 = dx, V1 = dy
  LD V6, V0
  LD V7, V1
  LD V8, V2
  LD V9, V3
  LD VA, 0         ; steps walked
ray:
  ADD V8, V6
  ADD V9, V7
  ADD VA, 1
  CALL cell        ; V0 = map cell under the ray
  SE V0, 0
  JP hit
  SE VA, 16
  JP ray
hit:
  LD VB, V0        ; 1 wall, 2 door, 0 nothing in reach
  SNE VB, 0
  JP next
  LD I, htab
  ADD I, VA
  LD V0, [I]       ; V0 = wall height for this distance
  LD I, bar
  LD V1, 7
  SUB V1, V0       ; VF = 1 when height <= 7: far wall, dithered
  SNE VF, 1
  LD I, dither
  SNE VB, 2
  LD I, door
  LD VB, V0        ; VB = height
  LD VC, V5
  ADD VC, VC       ; screen x = 2 * column
  LD V1, VB
  SHR V1
  LD VA, 16
  SUB VA, V1       ; VA = top row = 16 - height / 2
  LD V1, 15
  SUB V1, VB       ; VF = 1 when height <= 15: one sprite
  SE VF, 1
  JP tall
  LD V0, VB
  ADD V0, V0
  ADD V0, V0
  CALL drw
  JP next
tall:
  LD V0, 60        ; 15 rows first
  CALL drw
  ADD VA, 15
  LD V0, VB
  ADD V0, 0xF1     ; height - 15
  ADD V0, V0
  ADD V0, V0
  CALL drw
next:
  ADD V5, 1
  SE V5, 32
  JP col
  LD I, gun
  LD V0, 27
  LD V1, 25
  DRW V0, V1, 7
  SE VD, 0
  CALL flash
  LD V0, 1
  LD DT, V0
wait:
  LD V0, DT
  SE V0, 0
  JP wait
  JP loop

; draw a 2 px wide column of V0/4 rows at (VC, VA): jump table, one DRW per height
drw:
  JP V0, drwtab
drwtab:
  RET
  RET
  DRW VC, VA, 1
  RET
  DRW VC, VA, 2
  RET
  DRW VC, VA, 3
  RET
  DRW VC, VA, 4
  RET
  DRW VC, VA, 5
  RET
  DRW VC, VA, 6
  RET
  DRW VC, VA, 7
  RET
  DRW VC, VA, 8
  RET
  DRW VC, VA, 9
  RET
  DRW VC, VA, 10
  RET
  DRW VC, VA, 11
  RET
  DRW VC, VA, 12
  RET
  DRW VC, VA, 13
  RET
  DRW VC, VA, 14
  RET
  DRW VC, VA, 15
  RET

; V0 = map[(V9 & 0xF0) | (V8 >> 4)]
cell:
  LD V0, V8
  SHR V0
  SHR V0
  SHR V0
  SHR V0
  LD V1, V9
  LD VC, 0xF0
  AND V1, VC
  OR V0, V1
  LD I, map
  ADD I, V0
  LD V0, [I]
  RET

tleft:
  ADD V4, 0xFC
  LD V0, 0x7F
  AND V4, V0
  RET
tright:
  ADD V4, 4
  LD V0, 0x7F
  AND V4, V0
  RET
fwd:
  LD V0, V4
  JP move
back:
  LD V0, V4
  ADD V0, 64
  LD V1, 0x7F
  AND V0, V1
move:              ; every second frame half a cell along direction V0, walls block, the door wins
  LD V1, VE
  LD VC, 1
  AND V1, VC
  SE V1, 0
  RET
  ADD V0, V0
  LD I, dirs
  ADD I, V0
  LD V1, [I]
  LD V8, V2
  LD V9, V3
  ADD V8, V0
  ADD V9, V1
  CALL cell
  SNE V0, 2
  JP win
  SE V0, 0
  RET
  LD V2, V8
  LD V3, V9
  RET
fire:
  SE VD, 0
  RET
  LD VD, 3
  LD V0, 3
  LD ST, V0
  RET
flash:
  LD I, muzzle
  LD V0, 29
  LD V1, 19
  DRW V0, V1, 6
  ADD VD, 0xFF
  RET
win:               ; long beep, show the level number, back to the start
  LD V0, 30
  LD ST, V0
  LD I, lvl
  LD V0, [I]
  ADD V0, 1
  LD [I], V0
  CLS
  LD F, V0
  LD V1, 30
  LD VC, 13
  DRW V1, VC, 5
  LD V0, 60
  LD DT, V0
wwait:
  LD V0, DT
  SE V0, 0
  JP wwait
  LD V2, 0x18
  LD V3, 0x18
  LD V4, 0
  RET

htab:
  DB 0, 30, 24, 16, 12, 10, 8, 7, 6, 5, 5, 4, 4, 4, 3, 3, 3
bar:
  DB 0xC0, 0xC0, 0xC0, 0xC0, 0xC0, 0xC0, 0xC0, 0xC0, 0xC0, 0xC0, 0xC0, 0xC0, 0xC0, 0xC0, 0xC0
dither:
  DB 0x80, 0x40, 0x80, 0x40, 0x80, 0x40, 0x80, 0x40, 0x80, 0x40, 0x80, 0x40, 0x80, 0x40, 0x80
door:
  DB 0xC0, 0xC0, 0x00, 0xC0, 0xC0, 0x00, 0xC0, 0xC0, 0x00, 0xC0, 0xC0, 0x00, 0xC0, 0xC0, 0x00
gun:
  DB 0x18, 0x18, 0x3C, 0x3C, 0x7E, 0x7E, 0x7E
muzzle:
  DB 0x24, 0x18, 0x7E, 0x18, 0x24, 0x00
lvl:
  DB 0
dirs:
${dirTable()}
map:
${mapTable()}
`;


/** World memory of KORA BLOCKS: 8 bands of 4 rows, 64 bytes per row, all zero at start (air). */
function worldTable(): string {
  const rows: string[] = [];
  for (let band = 0; band < 8; band++) {
    rows.push(`band${band}:`);
    for (let r = 0; r < 4; r++) rows.push('  DB ' + Array(64).fill('0').join(', '));
  }
  return rows.join('\n');
}

const BLOCKS_SOURCE = `; KORA BLOCKS: a 2D block world in colour (4 display planes = 15 colours).
; The world is 64x32 bytes right behind this jump: RAM rows 1..32 ARE the map (0 air, 2 dirt, 3 stone, 4 grass,
; 5 wood, 6 leaves, 9 ore), the player is drawn on plane 8. Keys: 7/9 = walk (A/D), 5 = jump (W), 8 = dig below (S),
; 6 = dig ahead (E), 4 = place a carried block ahead (Q). Top left: blocks carried.
  JP main
  DB 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
  DB 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
${worldTable()}
main:
  LD V2, 8         ; player x
  LD V3, 0         ; player y (top pixel of two), falls onto the ground
  LD V4, 1         ; facing: 0 left, 1 right
  LD V5, 0         ; jump pixels left
  LD V6, 0         ; blocks carried
  LD V7, 2         ; carried block type
  LD V8, 0         ; frame counter
  LD VC, 0         ; dig cooldown
  LD VD, 20        ; ground height while generating
  LD V9, 0         ; column
gen:
  RND V0, 3
  SE V0, 0
  JP g1
  ADD VD, 0xFF
g1:
  SE V0, 3
  JP g2
  ADD VD, 1
g2:
  LD V1, VD
  LD V0, 12
  SUB V1, V0
  SE VF, 1
  LD VD, 12
  LD V1, 27
  SUB V1, VD
  SE VF, 1
  LD VD, 27
  LD VA, VD
  LD VB, 4         ; grass
  CALL put
  LD VB, 2         ; three rows of dirt
  ADD VA, 1
  CALL put
  ADD VA, 1
  CALL put
  ADD VA, 1
  CALL put
gstone:
  ADD VA, 1
  SNE VA, 32
  JP gnext
  RND VB, 7
  SE VB, 0
  LD VB, 3         ; stone
  SNE VB, 0
  LD VB, 9         ; one in eight: ore
  CALL put
  JP gstone
gnext:
  LD V0, V9
  LD V1, 7
  AND V0, V1
  SNE V0, 4
  CALL tree
  ADD V9, 1
  SE V9, 64
  JP gen
  CALL digit
  PLANE 8
  LD I, pl
  DRW V2, V3, 2
loop:
  ADD V8, 1
  LD VD, V2
  LD VE, V3
  SE V5, 0
  JP jump
  LD V9, V2        ; gravity: is the cell under the feet air?
  LD VA, V3
  ADD VA, 2
  CALL solid
  SNE V0, 0
  ADD V3, 1
  JP horiz
jump:
  LD V9, V2
  LD VA, V3
  ADD VA, 0xFF
  CALL solid
  SE V0, 0
  JP jend
  ADD V3, 0xFF
  ADD V5, 0xFF
  JP horiz
jend:
  LD V5, 0
horiz:
  LD V0, V8
  LD V1, 1
  AND V0, V1
  SE V0, 0
  JP keys2         ; walk on even frames only
  LD V0, 7
  SKNP V0
  CALL left
  LD V0, 9
  SKNP V0
  CALL right
keys2:
  LD V0, 5
  SKNP V0
  CALL jumpk
  SE VC, 0
  ADD VC, 0xFF
  SE VC, 0
  JP redraw
  LD V0, 8
  SKNP V0
  CALL digdown
  LD V0, 6
  SKNP V0
  CALL digface
  LD V0, 4
  SKNP V0
  CALL placek
redraw:
  SE V2, VD
  JP moved
  SE V3, VE
  JP moved
  JP pace
moved:
  PLANE 8
  LD I, pl
  DRW VD, VE, 2    ; erase the old player
  DRW V2, V3, 2
pace:
  LD V0, 4
  LD DT, V0
wait:
  LD V0, DT
  SE V0, 0
  JP wait
  JP loop

; ---- world access: V9 = x, VA = y ----
cell:              ; I = address of the cell, V0 = its value
  LD V0, VA
  SHR V0
  SHR V0
  ADD V0, V0
  ADD V0, V0
  CALL bandsel
  LD V0, VA
  LD V1, 3
  AND V0, V1
  SHL V0
  SHL V0
  SHL V0
  SHL V0
  SHL V0
  SHL V0
  ADD V0, V9
  ADD I, V0
  LD V0, [I]
  RET
bandsel:
  JP V0, bandtab
bandtab:
  LD I, band0
  RET
  LD I, band1
  RET
  LD I, band2
  RET
  LD I, band3
  RET
  LD I, band4
  RET
  LD I, band5
  RET
  LD I, band6
  RET
  LD I, band7
  RET
solid:             ; V0 = 0 when the cell is air, else its block; outside the world V0 = 1 and V1 = 1
  LD V1, 63
  SUB V1, V9
  SE VF, 1
  JP wall
  LD V1, 31
  SUB V1, VA
  SE VF, 1
  JP wall
  JP cell
wall:
  LD V0, 1
  LD V1, 1
  RET
put:               ; write VB into the cell and light its pixel
  CALL cell
  LD V0, VB
  LD [I], V0
pix:               ; toggle the pixel (V9, VA) in colour VB
  LD V0, VB
  ADD V0, V0
  ADD V0, V0
  CALL plsel
  LD I, px
  DRW V9, VA, 1
  RET
plsel:
  JP V0, pltab
pltab:
  PLANE 0
  RET
  PLANE 1
  RET
  PLANE 2
  RET
  PLANE 3
  RET
  PLANE 4
  RET
  PLANE 5
  RET
  PLANE 6
  RET
  PLANE 7
  RET
  PLANE 8
  RET
  PLANE 9
  RET
tree:              ; trunk of 3 wood on the grass at column V9, leaves 3 wide above it (VD = ground height)
  RND V0, 1
  SE V0, 1
  RET
  LD VA, VD
  LD VB, 5
  ADD VA, 0xFF
  CALL put
  ADD VA, 0xFF
  CALL put
  ADD VA, 0xFF
  CALL put
  LD VB, 6
  ADD VA, 0xFF
  CALL put
  ADD V9, 0xFF
  CALL put
  ADD VA, 0xFF
  CALL put
  ADD V9, 1
  CALL put
  ADD V9, 1
  CALL put
  ADD VA, 1
  CALL put
  ADD V9, 0xFF
  RET
digit:             ; blocks carried, top left, plane 8 (XOR: call twice to change)
  PLANE 8
  LD F, V6
  LD V0, 0
  LD V1, 0
  DRW V0, V1, 5
  RET
left:
  LD V4, 0
  LD V9, V2
  ADD V9, 0xFF
  JP step
right:
  LD V4, 1
  LD V9, V2
  ADD V9, 1
step:
  LD VA, V3
  CALL solid
  SE V0, 0
  RET
  ADD VA, 1
  CALL solid
  SE V0, 0
  RET
  LD V2, V9
  RET
jumpk:
  SE V5, 0
  RET
  LD V9, V2
  LD VA, V3
  ADD VA, 2
  CALL solid
  SNE V0, 0
  RET
  LD V5, 3
  RET
fx:                ; V9 = the cell ahead of the player
  SNE V4, 0
  ADD V9, 0xFF
  SE V4, 0
  ADD V9, 1
  RET
digdown:
  LD V9, V2
  LD VA, V3
  ADD VA, 2
  JP dig
digface:
  LD V9, V2
  CALL fx
  LD VA, V3
  ADD VA, 1
dig:
  CALL solid
  SNE V0, 0
  RET
  SNE V1, 1
  RET
  LD VB, V0
  LD V0, 0
  LD [I], V0
  CALL pix
  CALL digit
  LD V7, VB
  ADD V6, 1
  SNE V6, 16
  LD V6, 15
  CALL digit
  LD VC, 4
  RET
placek:
  SNE V6, 0
  RET
  LD V9, V2
  CALL fx
  LD VA, V3
  ADD VA, 1
  CALL solid
  SE V0, 0
  RET
  SNE V1, 1
  RET
  LD VB, V7
  LD V0, VB
  LD [I], V0
  CALL pix
  CALL digit
  ADD V6, 0xFF
  CALL digit
  LD VC, 4
  RET
px:
  DB 0x80, 0x80, 0x80, 0x80
pl:
  DB 0x80, 0x80
`;

export const CHIP8_PROGRAMS: Chip8Program[] = [
  {
    id: 'pong',
    name: 'PONG',
    keys: '1 / 4 = left paddle, C / D = right paddle. KORA steers every paddle nobody touches: leave both and watch the match.',
    source: `; PONG: KORA vs KORA, or take a paddle yourself
; keys: 1 up / 4 down (left)   C up / D down (right)
; a paddle nobody touches is steered by KORA; each serve she picks a new aim, sometimes a bad one
start:
  LD V2, 13        ; left paddle y
  LD V3, 13        ; right paddle y
  LD V8, 0         ; score left
  LD V9, 0         ; score right
serve:
  LD V4, 31        ; ball x
  LD V5, 15        ; ball y
  LD V6, 1         ; ball dx
  LD V7, 1         ; ball dy
  RND VD, 7        ; KORA's aim for the left paddle (0-4 hits, 5-7 misses)
  RND VE, 7        ; ... and for the right paddle
loop:
  CLS
  ADD VB, 1        ; frame counter
  LD VA, 1
  SKNP VA
  JP lkeys
  LD VA, 4
  SKNP VA
  JP lkeys
  ; left KORA: only while the ball comes closer; aims paddle top + VD at the ball
  SNE V6, 0xFF
  JP lai
  JP lafter
lai:
  LD V0, V2
  ADD V0, VD
  SUB V0, V5
  SE VF, 1
  JP laidown
  SE V0, 0
  CALL lup
  JP lafter
laidown:
  CALL ldown
  JP lafter
lkeys:
  LD VA, 1
  SKNP VA
  CALL lup
  LD VA, 4
  SKNP VA
  CALL ldown
lafter:
  LD VA, 0xC
  SKNP VA
  JP rkeys
  LD VA, 0xD
  SKNP VA
  JP rkeys
  ; right KORA: only while the ball comes closer; aims paddle top + VE at the ball
  SNE V6, 1
  JP ai
  JP afterkeys
ai:
  LD V0, V3
  ADD V0, VE
  SUB V0, V5       ; aim - ball y, VF = 1 when aim >= ball
  SE VF, 1
  JP aidown
  SE V0, 0
  CALL rup
  JP afterkeys
aidown:
  CALL rdown
  JP afterkeys
rkeys:
  LD VA, 0xC
  SKNP VA
  CALL rup
  LD VA, 0xD
  SKNP VA
  CALL rdown
afterkeys:
  ADD V4, V6
  ADD V5, V7
  SNE V5, 0
  LD V7, 1
  SNE V5, 31
  LD V7, 0xFF
  SNE V4, 4
  CALL hitl
  SNE V4, 60
  CALL hitr
  SNE V4, 0
  JP pointr
  SNE V4, 63
  JP pointl
  LD I, paddle
  LD V0, 2
  DRW V0, V2, 5
  LD V0, 61
  DRW V0, V3, 5
  LD I, ball
  DRW V4, V5, 1
  LD F, V8
  LD V0, 24
  LD V1, 1
  DRW V0, V1, 5
  LD F, V9
  LD V0, 36
  DRW V0, V1, 5
  LD V0, 3
  LD DT, V0
wait:
  LD V0, DT
  SE V0, 0
  JP wait
  JP loop
lup:
  SE V2, 0
  ADD V2, 0xFF
  RET
ldown:
  SE V2, 27
  ADD V2, 1
  RET
rup:
  SE V3, 0
  ADD V3, 0xFF
  RET
rdown:
  SE V3, 27
  ADD V3, 1
  RET
hitl:
  LD V0, V5
  SUB V0, V2
  SE VF, 1
  RET
  LD V1, 5
  SUB V0, V1
  SNE VF, 0
  LD V6, 1
  RET
hitr:
  LD V0, V5
  SUB V0, V3
  SE VF, 1
  RET
  LD V1, 5
  SUB V0, V1
  SNE VF, 0
  LD V6, 0xFF
  RET
pointr:
  ADD V9, 1
  LD V0, 8
  LD ST, V0
  JP serve
pointl:
  ADD V8, 1
  LD V0, 8
  LD ST, V0
  JP serve
paddle:
  DB 0xC0, 0xC0, 0xC0, 0xC0, 0xC0
ball:
  DB 0x80
`,
  },
  {
    id: 'brix',
    name: 'BRIX',
    keys: '4 = left, 6 = right',
    source: `; BRIX - break all the bricks
; keys: 4 left, 6 right
start:
  CLS
  LD V8, 0         ; score
  LD V9, 3         ; lives
  LD I, brick
  LD V1, 3
rows:
  LD V0, 0
cols:
  DRW V0, V1, 1
  ADD V0, 4
  SE V0, 64
  JP cols
  ADD V1, 2
  SE V1, 11
  JP rows
  LD V2, 29        ; paddle x
  LD I, paddle
  LD V0, 31
  DRW V2, V0, 1
serve:
  LD V4, 31        ; ball x
  LD V5, 20        ; ball y
  LD V6, 1
  LD V7, 0xFF
  LD I, ball
  DRW V4, V5, 1
loop:
  LD I, paddle
  LD V0, 31
  DRW V2, V0, 1
  LD VA, 4
  SKNP VA
  CALL pleft
  LD VA, 6
  SKNP VA
  CALL pright
  DRW V2, V0, 1
  LD I, ball
  DRW V4, V5, 1
  ADD V4, V6
  ADD V5, V7
  SNE V4, 0
  LD V6, 1
  SNE V4, 63
  LD V6, 0xFF
  SNE V5, 0
  LD V7, 1
  SNE V5, 31
  JP lost
  SNE V5, 30
  CALL padcheck
  DRW V4, V5, 1
  SNE VF, 1
  CALL hit
  LD V0, 2
  LD DT, V0
wait:
  LD V0, DT
  SE V0, 0
  JP wait
  JP loop
pleft:
  SE V2, 0
  ADD V2, 0xFE
  RET
pright:
  SE V2, 58
  ADD V2, 2
  RET
padcheck:
  LD V0, V4
  SUB V0, V2
  SE VF, 1
  RET
  LD V1, 6
  SUB V0, V1
  SE VF, 0
  RET
  LD V7, 0xFF
  LD V0, 2
  LD ST, V0
  RET
hit:
  LD V0, V5
  LD V1, 12
  SUB V0, V1
  SE VF, 0
  RET
  LD VB, V4
  LD V0, 0xFC
  AND VB, V0
  LD I, brick
  DRW VB, V5, 1
  LD I, ball
  LD V7, 1
  ADD V8, 1
  LD V0, 3
  LD ST, V0
  RET
lost:
  LD V0, 20
  LD ST, V0
  ADD V9, 0xFF
  SE V9, 0
  JP serve
  CLS
  LD I, bcd
  LD B, V8
  LD V2, [I]
  LD F, V1
  LD V3, 26
  LD V4, 13
  DRW V3, V4, 5
  LD F, V2
  LD V3, 32
  DRW V3, V4, 5
end:
  JP end
brick:
  DB 0xE0
paddle:
  DB 0xFC
ball:
  DB 0x80
bcd:
  DB 0, 0, 0
`,
  },
  {
    id: 'kora',
    name: 'KORA DEMO',
    keys: 'any key = beep',
    source: `; KORA demo: the name and a bouncing spark
start:
  CLS
  LD I, k
  LD V0, 16
  LD V1, 13
  DRW V0, V1, 6
  LD I, o
  LD V0, 25
  DRW V0, V1, 6
  LD I, r
  LD V0, 34
  DRW V0, V1, 6
  LD I, a
  LD V0, 43
  DRW V0, V1, 6
  LD V4, 5
  LD V5, 3
  LD V6, 1
  LD V7, 1
  LD I, spark
  DRW V4, V5, 1
loop:
  LD I, spark
  DRW V4, V5, 1
  ADD V4, V6
  ADD V5, V7
  SNE V4, 0
  LD V6, 1
  SNE V4, 63
  LD V6, 0xFF
  SNE V5, 0
  LD V7, 1
  SNE V5, 31
  LD V7, 0xFF
  DRW V4, V5, 1
  SNE VF, 1
  CALL bounce
  LD V0, 2
  LD DT, V0
wait:
  LD V0, DT
  SE V0, 0
  JP wait
  JP loop
bounce:
  LD V0, 4
  LD ST, V0
  LD V0, V6
  LD V6, V7
  LD V7, V0
  RET
k:
  DB 0x84, 0x88, 0x90, 0xE0, 0x90, 0x88
o:
  DB 0x70, 0x88, 0x88, 0x88, 0x88, 0x70
r:
  DB 0xF0, 0x88, 0x88, 0xF0, 0x90, 0x88
a:
  DB 0x70, 0x88, 0x88, 0xF8, 0x88, 0x88
spark:
  DB 0x80
`,
  },
  {
    id: 'ray',
    name: 'KORA RAY',
    keys: 'W/S walk · A/D turn · E fire (keys 5 8 7 9 6)',
    source: RAY_SOURCE,
  },
  {
    id: 'blocks',
    name: 'KORA BLOCKS',
    keys: 'A/D walk · W jump · S dig below · E dig ahead · Q place (keys 7 9 5 8 6 4)',
    source: BLOCKS_SOURCE,
  },
];
