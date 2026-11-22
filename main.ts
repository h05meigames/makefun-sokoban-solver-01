// Push-optimal Sokoban solver for make.fun's sokoban-solver-01-run-20261121.
//
// Approach (written from scratch for this entry):
//  1. Decompose the level into independent rooms: the player's row is the
//     hallway, and every square of it a box could never be pushed back from
//     is dead, so cutting those squares out of the floor splits the board
//     into the rooms, each holding its own boxes and goals. Rooms never
//     interact (a box pushed out of a room is lost), so the level optimum
//     is the sum of the rooms' optima and the rooms can be solved in turn.
//  2. Solve each room with A* over pushes: a state is the boxes' squares
//     plus the player's reachable region (named by its lowest square).
//     The heuristic is the cheapest assignment of boxes to goals by
//     Manhattan distance, which no push sequence can beat (one push moves
//     one box by one square), so the first solved state popped is
//     push-optimal. Two deadlocks are pruned: a box on a dead square (one
//     no sequence of pushes, ignoring the other boxes, can ever bring to a
//     goal) and a frozen 2x2 block of walls and boxes holding a box off its
//     goal. A plain breadth-first search over pushes is kept as a fallback.
//  3. Rebuild the player's walk between pushes with a shortest-path search
//     and stitch the rooms' moves together in discovery order.
//
// Deterministic: fixed direction order, a total order on the open list,
// and no clock, randomness or I/O beyond the level files, so two runs
// write the same bytes. Node 22 runs `node main.ts` with no install step.
//
// Local run: mkdir -p out && MAKEFUN_INPUT_DIR=practice/input MAKEFUN_OUTPUT_DIR=out node main.ts
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const I = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const O = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

/** Directions: [dx, dy, walk letter, push letter]. Fixed order, everywhere. */
const DIRS: [number, number, string, string][] = [
  [0, -1, 'u', 'U'],
  [0, 1, 'd', 'D'],
  [-1, 0, 'l', 'L'],
  [1, 0, 'r', 'R'],
];

interface Board {
  w: number;
  h: number;
  wall: Uint8Array;
  goals: number[];
  boxes: number[];
  player: number;
}

function parseLevel(text: string): Board {
  const rows = text.split('\n').filter((r) => r.length > 0);
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const wall = new Uint8Array(w * h).fill(1);
  const goals: number[] = [];
  const boxes: number[] = [];
  let player = -1;
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      const i = y * w + x;
      if (ch === '#') continue;
      wall[i] = 0;
      if (ch === '.' || ch === '*' || ch === '+') goals.push(i);
      if (ch === '$' || ch === '*') boxes.push(i);
      if (ch === '@' || ch === '+') player = i;
    }
  });
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) wall[y * w + x] = 1;
    }
  }
  return { w, h, wall, goals, boxes: boxes.sort((a, b) => a - b), player };
}

/**
 * The squares a lone box can be pushed from onto some goal: pull the goals
 * backwards — a box on y can be pushed in direction d onto x = y + d when
 * the player can stand on y - d, so y is live when x is live and both
 * y and y - d are open floor.
 */
function liveSquares(b: Board): Uint8Array {
  const live = new Uint8Array(b.w * b.h);
  const queue = [...b.goals];
  for (const g of b.goals) live[g] = 1;
  for (let qi = 0; qi < queue.length; qi++) {
    const x = queue[qi];
    for (const [dx, dy] of DIRS) {
      const d = dy * b.w + dx;
      const y = x - d;
      if (!b.wall[y] && !b.wall[y - d] && !live[y]) {
        live[y] = 1;
        queue.push(y);
      }
    }
  }
  return live;
}

/** Flood fill from `from` around walls and the boxes in `occupied`. Returns the lowest reached square; `seen` is stamped, not cleared. */
function regionLow(
  b: Board,
  occupied: Uint8Array,
  from: number,
  seen: Int32Array,
  stamp: number,
  stack: Int32Array,
): number {
  let low = from;
  let n = 0;
  stack[n++] = from;
  seen[from] = stamp;
  while (n > 0) {
    const p = stack[--n];
    if (p < low) low = p;
    for (let k = 0; k < 4; k++) {
      const q = k === 0 ? p - b.w : k === 1 ? p + b.w : k === 2 ? p - 1 : p + 1;
      if (!b.wall[q] && !occupied[q] && seen[q] !== stamp) {
        seen[q] = stamp;
        stack[n++] = q;
      }
    }
  }
  return low;
}

function isRegionMember(seen: Int32Array, stamp: number, q: number): boolean {
  return seen[q] === stamp;
}

/** Whether the box just pushed to `t` sits in a frozen 2x2 block of walls and boxes with a box off its goal. */
function frozenBlock(b: Board, occupied: Uint8Array, goal: Uint8Array, t: number): boolean {
  for (const a of [t, t - 1, t - b.w, t - b.w - 1]) {
    const c = a + 1;
    const d = a + b.w;
    const e = d + 1;
    if (!(b.wall[a] || occupied[a]) || !(b.wall[c] || occupied[c]) || !(b.wall[d] || occupied[d]) || !(b.wall[e] || occupied[e])) continue;
    if ((occupied[a] && !goal[a]) || (occupied[c] && !goal[c]) || (occupied[d] && !goal[d]) || (occupied[e] && !goal[e])) return true;
  }
  return false;
}

/**
 * Cheapest assignment of boxes to goals by Manhattan distance (exact by
 * permutation while the box count is small, else a sum of nearest-goal
 * distances). Either is a lower bound on the pushes still needed.
 */
function heuristic(b: Board, boxes: number[]): number {
  const n = boxes.length;
  const m = b.goals.length;
  if (n === 0) return 0;
  const dist = (box: number, goal: number): number =>
    Math.abs((box % b.w) - (goal % b.w)) + Math.abs(Math.floor(box / b.w) - Math.floor(goal / b.w));
  if (n <= 6 && n <= m) {
    const used = new Array<boolean>(m).fill(false);
    let best = Infinity;
    const rec = (i: number, sum: number): void => {
      if (sum >= best) return;
      if (i === n) {
        best = sum;
        return;
      }
      for (let g = 0; g < m; g++) {
        if (used[g]) continue;
        used[g] = true;
        rec(i + 1, sum + dist(boxes[i], b.goals[g]));
        used[g] = false;
      }
    };
    rec(0, 0);
    return best;
  }
  let sum = 0;
  for (const box of boxes) {
    let d = Infinity;
    for (const g of b.goals) d = Math.min(d, dist(box, g));
    sum += d;
  }
  return sum;
}

/** Shortest walk from `from` to `to` around walls and boxes, in lower-case letters. Throws when unreachable. */
function walkTo(b: Board, occupied: Uint8Array, from: number, to: number): string {
  if (from === to) return '';
  const prev = new Int32Array(b.w * b.h).fill(-1);
  const how: string[] = new Array<string>(b.w * b.h);
  const queue = [from];
  prev[from] = from;
  for (let qi = 0; qi < queue.length; qi++) {
    const p = queue[qi];
    if (p === to) break;
    for (const [dx, dy, letter] of DIRS) {
      const q = p + dy * b.w + dx;
      if (b.wall[q] || occupied[q] || prev[q] !== -1) continue;
      prev[q] = p;
      how[q] = letter;
      queue.push(q);
    }
  }
  if (prev[to] === -1) throw new Error('walkTo: push square out of reach');
  let s = '';
  for (let p = to; p !== from; p = prev[p]) s = how[p] + s;
  return s;
}

/** The player's square after playing `moves` from `from` (case aside). */
function endOf(w: number, from: number, moves: string): number {
  let p = from;
  for (const ch of moves) {
    const c = ch.toLowerCase();
    p += c === 'u' ? -w : c === 'd' ? w : c === 'l' ? -1 : 1;
  }
  return p;
}

interface SearchResult {
  pushes: number;
  moves: string;
}

/**
 * Push-optimal search over one board: A* when `astar` is set (heuristic
 * above), breadth-first over pushes otherwise. Returns null when the board
 * has no solution within `maxStates` states, or when the search gives up
 * on an unsolvable board; `capped` marks the cap, not a proof of none.
 */
function searchBoard(b: Board, maxStates: number, astar: boolean): (SearchResult & { capped: boolean }) | null {
  const size = b.w * b.h;
  const goal = new Uint8Array(size);
  for (const g of b.goals) goal[g] = 1;
  const live = liveSquares(b);
  if (b.boxes.some((x) => !live[x])) return null;
  const solved = (boxes: number[]): boolean => boxes.every((x) => goal[x]);
  if (solved(b.boxes)) return { pushes: 0, moves: '', capped: false };

  const occupied = new Uint8Array(size);
  const seen = new Int32Array(size);
  const mark = new Int32Array(size);
  const stack = new Int32Array(size);
  let stamp = 0;

  const boxesList: number[][] = [b.boxes.slice()];
  const playerList: number[] = [b.player];
  const gList: number[] = [0];
  const parent: number[] = [-1];
  const pushFrom: number[] = [-1];
  const pushTo: number[] = [-1];
  const pushDir: number[] = [-1];

  // State key: the region's lowest square, then the boxes' squares.
  const keyOf = (boxes: number[], low: number): string => low + ':' + boxes.join(',');

  // Best pushes known for each key. A state first generated down a longer
  // path may later be reached down a shorter one, so a worse copy never
  // blocks a better one: the better copy is pushed too, and the worse one
  // is skipped when popped as stale.
  const best = new Map<string, number>();
  for (const x of b.boxes) occupied[x] = 1;
  const startLow = regionLow(b, occupied, b.player, seen, ++stamp, stack);
  for (const x of b.boxes) occupied[x] = 0;
  best.set(keyOf(b.boxes, startLow), 0);

  // Open list: a binary heap on (f, h, sequence) — a total order, so the search is deterministic.
  type HeapEntry = [number, number, number, number]; // f, h, seq, state index
  const heap: HeapEntry[] = [];
  let seq = 0;
  const less = (x: HeapEntry, y: HeapEntry): boolean =>
    x[0] < y[0] || (x[0] === y[0] && (x[1] < y[1] || (x[1] === y[1] && x[2] < y[2])));
  const heapPush = (e: HeapEntry): void => {
    let i = heap.length;
    heap.push(e);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!less(heap[i], heap[p])) break;
      [heap[i], heap[p]] = [heap[p], heap[i]];
      i = p;
    }
  };
  const heapPop = (): HeapEntry => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length > 0) {
      heap[0] = last;
      for (let i = 0; ; ) {
        let c = 2 * i + 1;
        if (c >= heap.length) break;
        if (c + 1 < heap.length && less(heap[c + 1], heap[c])) c++;
        if (!less(heap[c], heap[i])) break;
        [heap[i], heap[c]] = [heap[c], heap[i]];
        i = c;
      }
    }
    return top;
  };
  heapPush([astar ? heuristic(b, b.boxes) : 0, astar ? heuristic(b, b.boxes) : 0, seq++, 0]);

  let expanded = 0;
  let found = -1;
  while (heap.length > 0) {
    const [, , , s] = heapPop();
    const boxes = boxesList[s];
    const g = gList[s];
    for (const x of boxes) occupied[x] = 1;
    const low = regionLow(b, occupied, playerList[s], seen, ++stamp, stack);
    if (best.get(keyOf(boxes, low)) !== g) {
      for (const x of boxes) occupied[x] = 0;
      continue; // Stale copy: a shorter path to this state was found since.
    }
    if (solved(boxes)) {
      found = s;
      for (const x of boxes) occupied[x] = 0;
      break;
    }
    if (expanded >= maxStates) {
      for (const x of boxes) occupied[x] = 0;
      return { pushes: -1, moves: '', capped: true };
    }
    expanded++;
    const here = stamp;
    for (let bi = 0; bi < boxes.length; bi++) {
      const box = boxes[bi];
      for (let di = 0; di < 4; di++) {
        const [dx, dy] = DIRS[di];
        const d = dy * b.w + dx;
        const t = box + d;
        if (!isRegionMember(seen, here, box - d) || b.wall[t] || occupied[t] || !live[t]) continue;
        occupied[box] = 0;
        occupied[t] = 1;
        if (frozenBlock(b, occupied, goal, t)) {
          occupied[t] = 0;
          occupied[box] = 1;
          continue;
        }
        const next = boxes.slice();
        next[bi] = t;
        next.sort((x, y) => x - y);
        const nextLow = regionLow(b, occupied, box, mark, ++stamp, stack);
        const nextKey = keyOf(next, nextLow);
        occupied[t] = 0;
        occupied[box] = 1;
        const known = best.get(nextKey);
        if (known !== undefined && known <= g + 1) continue;
        if (boxesList.length >= maxStates) {
          for (const x of boxes) occupied[x] = 0;
          return { pushes: -1, moves: '', capped: true };
        }
        const idx = boxesList.length;
        best.set(nextKey, g + 1);
        boxesList.push(next);
        playerList.push(box);
        gList.push(g + 1);
        parent.push(s);
        pushFrom.push(box);
        pushTo.push(t);
        pushDir.push(di);
        const h = astar ? heuristic(b, next) : 0;
        heapPush([g + 1 + h, h, seq++, idx]);
      }
    }
    for (const x of boxes) occupied[x] = 0;
  }
  if (found < 0) return null;

  // Rebuild the push list, then the moves: walk to each push square, then push.
  const path: number[] = [];
  for (let s = found; s > 0; s = parent[s]) path.push(s);
  path.reverse();
  let moves = '';
  let player = b.player;
  let boxes = b.boxes.slice();
  for (const s of path) {
    const from = pushFrom[s];
    const to = pushTo[s];
    const di = pushDir[s];
    for (const x of boxes) occupied[x] = 1;
    moves += walkTo(b, occupied, player, from - (dyOf(di) * b.w + dxOf(di)));
    for (const x of boxes) occupied[x] = 0;
    moves += DIRS[di][3];
    player = from;
    boxes = boxesList[s];
    void to;
  }
  return { pushes: path.length, moves, capped: false };

  function dxOf(di: number): number {
    return DIRS[di][0];
  }
  function dyOf(di: number): number {
    return DIRS[di][1];
  }
}

/**
 * The level's rooms: cut the dead squares of the player's row (the
 * hallway) out of the floor; each remaining part holding a box is a room.
 * Null when the level is no set of rooms (a box in the hallway, or a part
 * with more or fewer boxes than goals).
 */
function roomsOf(b: Board): { squares: number[]; boxes: number[]; goals: number[] }[] | null {
  const live = liveSquares(b);
  const row = Math.floor(b.player / b.w);
  const cut = new Uint8Array(b.w * b.h);
  for (let i = row * b.w; i < (row + 1) * b.w; i++) {
    if (!b.wall[i] && !live[i]) cut[i] = 1;
  }
  if (b.boxes.some((x) => cut[x])) return null;
  const part = new Int32Array(b.w * b.h).fill(-1);
  const rooms: { squares: number[]; boxes: number[]; goals: number[] }[] = [];
  for (let s = 0; s < b.w * b.h; s++) {
    if (b.wall[s] || cut[s] || part[s] >= 0) continue;
    const squares = [s];
    part[s] = rooms.length;
    for (let i = 0; i < squares.length; i++) {
      for (const [dx, dy] of DIRS) {
        const q = squares[i] + dy * b.w + dx;
        if (!b.wall[q] && !cut[q] && part[q] < 0) {
          part[q] = rooms.length;
          squares.push(q);
        }
      }
    }
    rooms.push({ squares, boxes: [], goals: [] });
  }
  for (const x of b.boxes) rooms[part[x]].boxes.push(x);
  for (const g of b.goals) {
    if (part[g] < 0) return null;
    rooms[part[g]].goals.push(g);
  }
  if (rooms.some((r) => r.boxes.length !== r.goals.length)) return null;
  return rooms.filter((r) => r.boxes.length > 0);
}

/** Push-optimal solution of one board, A* first, breadth-first as fallback. */
function solveBoard(b: Board): SearchResult | null {
  const a = searchBoard(b, 400_000, true);
  if (a !== null && !a.capped) return a;
  if (a === null) return null; // A* emptied the open list: unsolvable.
  const c = searchBoard(b, 300_000, false);
  if (c !== null && !c.capped) return c;
  return null;
}

/** The level solved room by room; null when any room gives up. */
function solveByRooms(level: Board): SearchResult | null {
  const rooms = roomsOf(level);
  if (rooms === null) return solveBoard(level);
  let player = level.player;
  let pushes = 0;
  let moves = '';
  const done: boolean[] = rooms.map(() => false);
  for (let ri = 0; ri < rooms.length; ri++) {
    const room = rooms[ri];
    const wall = level.wall.slice();
    for (let oj = 0; oj < rooms.length; oj++) {
      if (oj === ri) continue;
      for (const x of done[oj] ? rooms[oj].goals : rooms[oj].boxes) wall[x] = 1;
    }
    const sub: Board = {
      w: level.w,
      h: level.h,
      wall,
      goals: room.goals.slice().sort((x, y) => x - y),
      boxes: room.boxes.slice().sort((x, y) => x - y),
      player,
    };
    const solved = solveBoard(sub);
    if (solved === null) return null;
    pushes += solved.pushes;
    moves += solved.moves;
    player = endOf(level.w, player, solved.moves);
    done[ri] = true;
  }
  return { pushes, moves };
}

function solve(text: string): string {
  const level = parseLevel(text);
  const solved = solveByRooms(level);
  return solved === null ? '' : solved.moves;
}

for (const id of readdirSync(I).sort()) {
  const moves = solve(readFileSync(join(I, id, 'level.txt'), 'utf8'));
  mkdirSync(join(O, id), { recursive: true });
  writeFileSync(join(O, id, 'solution.txt'), `${moves}\n`);
}
