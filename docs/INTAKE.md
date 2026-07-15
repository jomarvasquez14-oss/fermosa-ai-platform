# Logbook Intake — Two Paths, One Seam

The platform reconciles each branch's **daily logbook** against the **CRM**. There are
two ways to get a paper logbook page into the platform, and they converge on the same
internal shape so everything downstream (patient matching, the deterministic rule engine,
findings, reports) is identical regardless of which path was used.

```
  Photo of the page ──► OCR (Claude vision) ──┐
                                              ├──► ConfirmedEntry[] ──► matching ──► rules ──► findings
  Typed spreadsheet ──► CSV intake (M0061) ───┘
        (Excel/CSV)
```

`ConfirmedEntry` (`services/rules/types.ts`) is the seam. Both paths produce it; neither
the rule engine nor the CRM comparison knows or cares about the source (ADR-015, ADR-041).

## Which path to use

| | OCR (photo) | Typed intake (Excel/CSV) |
| --- | --- | --- |
| Accuracy | Unproven on handwriting | ~100% (a typed number is not a guess) |
| Cost | Per-image API call | Free (no AI call) |
| Blockers | Anthropic API key + no-retention/DPA sign-off (PII) | None |
| Role | Contemporaneous **evidence**; occasional spot-check | Fast, accurate everyday path |

Typed intake is preferred for the transaction data the audit compares against the CRM.
The **paper logbook is still kept as evidence** — a typed sheet alone is easy to doctor —
with OCR reserved to spot-check typed data against the original photo (a follow-on).

## The CSV format (M0061)

Two files per day, per branch, under `templates/logbook-intake/` (run `pnpm intake:template`):

- **transactions.csv** — one row per client SERVICE line. Rows sharing the same
  `lineNumber` are one client; per-client fields (name, times, cash, staff, points) go on
  the client's first row only. Columns are defined once in
  `services/intake/logbook-intake-schema.ts` (`TRANSACTION_HEADERS`). Amounts are bare
  numbers (no `₱`, no thousands comma — the parser strips them anyway); blank = absent.
- **daily-summary.csv** — a `field,value` list of the end-of-day rollup (census, sales,
  expenses, points, remarks…). Parsed and stored for now; reconciling these totals against
  CRM sums is a deferred financial-tally milestone.

Validate a filled sheet end to end (offline, deterministic, no API key):

```
pnpm intake:check <transactions.csv> [--summary <daily-summary.csv>]
```

It prints the resulting `ConfirmedEntry[]`, the captured per-client detail, the parsed
summary, and any issues (bad `lineNumber`, missing column, mismatched continuation name…).

See [MILESTONES/M0061.md](MILESTONES/M0061.md) and ADR-041 in [DECISIONS.md](DECISIONS.md).
