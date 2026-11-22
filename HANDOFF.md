# HANDOFF — sokoban-solver-01-run-20261121

Entry built, tested, and pushed. NOT submitted — the monitor submits after
this run completes (usage rows for this builder session exist only then).

## Competition
- sokoban-solver-01-run-20261121, "Build the best Sokoban solver, 21 November 2026"
- Entries close: 2026-11-23T03:00:00Z = 23 Nov 2026 10:00 WIB
- Prize $100: top 10 share $10 each. Entry fee: none. A reward needs a score
  strictly above make.fun's own plain-astar 1.0.0 house baseline.
- Quota used: 0 submissions for this slug so far (this account). Task-body rule:
  max 5/day, 20 total; the requirements file states 10/day, 20 total — one
  submission is within either limit.

## The entry (final — do not change the code)
- Repo: https://github.com/h05meigames/makefun-sokoban-solver-01 (public,
  created after the competition opened; MIT license)
- Code-final commit: bb1b4bc. HEAD will add only this HANDOFF.md — submit the
  repo HEAD at submit time.
- Repo About: homepage https://make.fun/bounty/sokoban-solver-01-run-20261121,
  topics makefun, ai-agents, bounties, sokoban.
- Referral in README: https://make.fun/r/0ene8b3q only. No other referral
  code anywhere in the entry (checked by grep).
- Title to submit: "Push-Optimal Sokoban Solver — room-decomposed A* over pushes"
- What it is: main.ts (Node 22, no dependencies) answers all 5 instances in
  one run. Room decomposition (hallway dead-square cut) + push-optimal A*
  per room (Manhattan-assignment heuristic, dead-square and frozen-2x2
  pruning, BFS fallback) + shortest-path walk reconstruction. Written from
  scratch for this entry; no copied solver code.

## Verified
- Practice set (kit scorer): score **1,000,000**, passed 1, all 5 answered —
  every instance at its push optimum: i001 13, i002 16, i003 29, i004 47,
  i005 60 pushes (P* 13/16/29/47/60). Whole-set runtime ~0.3 s (limit 60 s).
- 20 further sets drawn fresh from the kit's own generator (draw.ts, random
  seeds): **1,000,000 on every one**, worst runtime ~0.5 s per set.
- Determinism: two runs on the practice set (from the committed tree) write
  identical bytes.
- Repo size: 20,523 bytes (limit 1 MiB).
- One bug found and fixed during testing: the first fresh-set run had one
  instance at 65 vs P* 63 pushes — A* discarded a shorter-path copy of a
  state first generated down a longer path. Fixed by tracking best-g per
  state key and skipping stale pops; all 20 fresh sets then scored 1,000,000.
- Dry-run gate: `node cli/makefun.mjs bundle ... --dry-run` (from the fresh
  sokoban kit dir, downloaded this run) exits 0 with NO "missing" errors.
  Warnings only, all by design: 0 usage rows attached to this builder
  session — the rows are written only once this run completes (see "Parent
  submission") — and a session-cut note (2 earlier records left out,
  developer message kept). The parent session is not in this bundle — the
  parent chats are carried as context-sessions, not bundled sessions; the
  same pattern submitted fine for 19/20/21 Nov.

## Parent submission — do this AFTER this subagent run completes
1. Run the SELECT (muse.db) for the builder agent_id
   ade4b7f4-2d6a-4bba-a9f0-94908358660b and the parent
   4f194405-085a-4f62-b4dd-7b00c6ee27a6, and REWRITE the usage file
   hidden_files/muse-usage-rows-sokoban-solver-01-run-20261121.jsonl with the
   fresh rows, one JSON object per line (it currently holds only the parent's
   2 rows; the builder's rows appear only after this run completes):
   SELECT u.agent_id AS agent_id, u.message_id AS message_id, u.created_at AS created_at, u.input_tokens AS input_tokens, u.output_tokens AS output_tokens, a.model AS model FROM agent.agent_message_token_usage u JOIN agent.agents a ON a.agent_id = u.agent_id WHERE u.agent_id IN ('ade4b7f4-2d6a-4bba-a9f0-94908358660b','4f194405-085a-4f62-b4dd-7b00c6ee27a6') ORDER BY u.created_at DESC LIMIT 500
   (Verify at least 1 row for ade4b7f4 before bundling. If 0, end the turn
   and retry in the next.)
2. Bundle with the EXACT flags below (from the sokoban kit dir
   ~/workspace/makefun-agent2/sokoban-solver-01-run-20261121-kit/sokoban-solver-01-run-20261121-kit),
   only swapping in the rewritten usage file. Keep --no-discover, the
   single --parent-session, and --prompt-origin scheduled:
   node cli/makefun.mjs bundle --repo ~/workspace/makefun-agent2/entries/sokoban-solver-01-run-20261121 --out <bundle.tar.gz>
     --session /home/hatch/agents/agent-ade4b7f4-2d6a-4bba-a9f0-94908358660b/sessions/ade4b7f4-2d6a-4bba-a9f0-94908358660b.jsonl
     --no-discover
     --prompt-file ~/workspace/goals/make-fun-bounty-pantau-dan-submit-tiap-30-menit/hidden_files/prompt-scheduled-makefun-pantau-30menit.txt --prompt-origin scheduled
     --prompt-via "parent agent spawned a build subagent for the sokoban-solver-01-run-20261121 bounty under the standing 30-minute bounty monitor"
     --parent-session /home/hatch/agents/agent-4f194405-085a-4f62-b4dd-7b00c6ee27a6/sessions/4f194405-085a-4f62-b4dd-7b00c6ee27a6.jsonl
     --muse-usage <rewritten usage file> --system-prompt ~/workspace/goals/make-fun-bounty-pantau-dan-submit-tiap-30-menit/hidden_files/system-prompt-sokoban-solver-01-run-20261121.txt
     --harness muse-app --harness-version 1.3 --model ipnext/avocado-5.17-v2
     --provider ipnext --effort default --mcp none
   (The --model is ipnext/avocado-5.17-v2 — the model this builder session
   actually recorded, same as 20/21 Nov.)
3. Submit via the kit CLI / API with repo_url + commit_sha + bundle
   transcript, repo https://github.com/h05meigames/makefun-sokoban-solver-01,
   title "Push-Optimal Sokoban Solver — room-decomposed A* over pushes",
   using the repo HEAD commit at submit time. Save the receipt in
   hidden_files/ and check the dev grade. Do NOT submit any other entry.
