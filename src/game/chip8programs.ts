// Built-in programs for the KORA Terminal, written for the in-game assembler (see chip8.ts).
export interface Chip8Program {
  id: string;
  name: string;
  keys: string; // human hint
  source: string;
}

export const CHIP8_PROGRAMS: Chip8Program[] = [
  {
    id: 'pong',
    name: 'PONG',
    keys: '1 / 4 = left paddle, C / D = right paddle',
    source: `; PONG for two players
; keys: 1 up / 4 down (left)   C up / D down (right)
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
loop:
  CLS
  LD VA, 1
  SKNP VA
  CALL lup
  LD VA, 4
  SKNP VA
  CALL ldown
  LD VA, 0xC
  SKNP VA
  CALL rup
  LD VA, 0xD
  SKNP VA
  CALL rdown
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
];
