# Performance Review

> Sprint 4.0D (2026-07-14). Current measurements, bottleneck analysis, and
> recommendations — **no premature optimization**: nothing here blocks OCR/CRM
> integration, and no optimization work should start before the load exists.
> Re-measure after real OCR volumes arrive.

## Measurements (v0.6.1, production build)

### Bundle sizes (`next build`, all routes)

Shared first-load JS: **102 kB**. Largest routes by route-specific JS:

| Route                  | Route JS | First Load JS | Notes                                                        |
| ---------------------- | -------- | ------------- | ------------------------------------------------------------ |
| `/login`               | 18.5 kB  | 147 kB        | react-hook-form + zod resolver on the client                 |
| `/audit/[id]/progress` | 7.0 kB   | 127 kB        | timeline UI                                                  |
| `/dev/crm`             | 6.8 kB   | 117 kB        | dev tool (SA only)                                           |
| `/dev/browser`         | 6.7 kB   | 117 kB        | dev tool (SA only)                                           |
| `/playground`          | 5.6 kB   | 123 kB        | dev tool (SA only)                                           |
| `/findings`            | 5.5 kB   | 144 kB        | findings kit                                                 |
| `/audit/[id]`          | 0.3 kB   | **209 kB**    | heaviest first-load: submission editor (upload kit + dialog) |
| `/audit`               | 0.3 kB   | 180 kB        | shell + list                                                 |

Verdict: healthy. The 209 kB editor page is the ceiling; everything ships
server-first with small client islands.

### Rule engine

Measured by the performance test (CI-enforced budget): **1,000 confirmed
entries × 40 patients × 13 rules ≈ 90–220 ms** in-process (test asserts
< 300 ms; the whole 20-test rules file runs in ~90–220 ms locally). Real-shaped
run, measured via the live `rules.evaluate` span: **2.5 ms** for an 11-entry
submission (17 rule results, 12 findings). Not a bottleneck.

### Audit orchestrator (per run, measured via 4.0B spans)

- Simulated stages (OCR/CRM/report): ~400 ms each by design (mock delay).
- MATCHING (real): mock extraction + connector lookups + rules + finding
  persistence ≈ 200–600 ms for small submissions.
- End-to-end run (excluding human review wait): ~2 s, dominated by mock
  delays. Stage timing now logs as `span` lines with the job id as
  `correlationId`, so this table can be refreshed from logs at any time.

### Database query profile (code review)

- Orchestrator: ~6–8 queries per stage transition (guarded status updates,
  stage row updates, submission status mapping, progress reload). ~35–45
  queries per full run. Acceptable at current volume; chatty by design for
  crash-safe state.
- Submission list: single query with `include` (images/branch/submitter) —
  no N+1. Findings list: single query, `take: 500`.
- Uploads: one action round-trip per image (deliberate: per-image retry).

### Server actions (observed in browser verification)

Draft save with 2 images ≈ 1–2 s (sequential per-image uploads); findings
transition < 150 ms; orchestrator actions dominated by stage simulation.

## Potential bottlenecks (ranked by when they'll matter)

1. **Inline pipeline execution** — the run executes inside the request. Real
   OCR (seconds × up to 20 images) will exceed sensible request budgets.
   _When:_ OCR integration (3.8). _Plan already exists:_ executors are
   contract-stable; move the loop behind a background runner.
2. **Progress polling** — the progress page refreshes every 1.5 s via
   `router.refresh()` (full RSC re-render). Fine for one auditor; wasteful at
   scale. _When:_ multi-auditor daily use.
3. **Sequential image uploads** — 20 × 10 MB uploads serialize. Parallelism
   (3–4 at a time) is a small client change. _When:_ branch complaints, if
   ever.
4. **`Buffer`-based storage reads** — `/api/images/[id]` loads whole files
   into memory. Fine for ≤ 10 MB images; revisit only if asset types grow.
5. **Findings list `take: 500`** without pagination. _When:_ months of real
   findings.

## Recommendations

- **Do now (cheap, already done in 4.0B):** keep span instrumentation on —
  the timing tables above stay refreshable from logs.
- **Do with OCR integration:** background job runner for the pipeline; the
  progress page then reads job rows it already reads today.
- **Do when usage justifies:** poll → server-sent refresh or lighter progress
  endpoint; parallel uploads; findings pagination.
- **Don't do:** bundle micro-optimization (largest page is 209 kB first-load),
  rule-engine optimization (3 orders of magnitude headroom), query batching in
  the orchestrator (crash-safety is worth the chatter at this volume).
