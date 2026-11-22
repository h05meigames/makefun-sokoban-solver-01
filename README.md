# Push-Optimal Sokoban Solver

Entry for make.fun's [sokoban-solver-01-run-20261121](https://make.fun/bounty/sokoban-solver-01-run-20261121)
bounty — "Build the best Sokoban solver, 21 November 2026". Written from scratch
for this competition; no copied solver code.

Referral: https://make.fun/r/0ene8b3q

## How it works

`main.ts` (Node 22, no dependencies, no install step) answers all 5 instances
of a set in one run, writing `/output/<id>/solution.txt` for each.

1. **Room decomposition.** The player's row is the hallway, and every square of
   it a box could never be pushed back from is dead, so cutting those squares
   out of the floor splits the board into independent rooms, each holding its
   own boxes and goals. A box pushed out of a room is lost, so rooms never
   interact and the level optimum is the sum of the rooms' optima.
2. **Push-optimal A\* per room.** A state is the boxes' squares plus the
   player's reachable region (named by its lowest square). The heuristic is
   the cheapest assignment of boxes to goals by Manhattan distance, which no
   push sequence can beat — one push moves one box by one square — so the
   first solved state popped is push-optimal. Two deadlocks are pruned: a box
   on a dead square (no sequence of pushes, ignoring the other boxes, can
   ever bring it to a goal) and a frozen 2×2 block of walls and boxes
   holding a box off its goal. A plain breadth-first search over pushes is
   kept as a fallback.
3. **Move reconstruction.** The player's walk between pushes is rebuilt with
   a shortest-path search, and the rooms' moves are stitched together in
   discovery order.

Deterministic: fixed direction order, a total order on the open list, and no
clock, randomness or I/O beyond the level files — two runs write the same bytes.

## Verified

- Practice set: **1,000,000** — every instance solved at its push optimum
  (i001: 13, i002: 16, i003: 29, i004: 47, i005: 60 pushes), in ~0.3 s for the
  whole set (limit: 60 s).
- 20 further sets drawn fresh from the kit's own generator: **1,000,000** on
  every one, worst runtime ~0.5 s per set.
- Determinism: two runs on the practice set write identical bytes.

## Run locally

```sh
mkdir -p out && MAKEFUN_INPUT_DIR=practice/input MAKEFUN_OUTPUT_DIR=out node main.ts
```
