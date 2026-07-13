# Vision — Fermosa AI Platform

> The product vision: what we are building, for whom, and how we will know it
> worked. Not architecture ([ARCHITECTURE.md](ARCHITECTURE.md)), not process
> ([PROJECT_RULES.md](PROJECT_RULES.md)) — the destination.
> Owner: project lead. Revised when the business changes, not per sprint.

## The problem

Fermosa runs 20+ skincare clinic branches. Every treatment is recorded twice: by hand
in a paper logbook at the branch, and digitally in the CRM by a receptionist. Money
leaks in the gap between those two records — treatments performed but never encoded,
encoded but never invoiced, invoices edited or deleted after the fact. Today, catching
this requires a human auditor manually cross-checking photographed logbook pages
against the CRM, branch by branch, line by line. It is slow, sampling-based, and easy
to defeat.

**The platform's one-sentence purpose: make every treatment logbook entry provably
reconciled against the CRM, every day, for every branch — with human judgment applied
only where it is actually needed.**

## What version 1.0 looks like

A branch manager photographs the day's logbook with their phone and submits it in
under two minutes. Within the hour, the system has read the handwriting, matched every
line against the CRM, and produced a set of **findings** — each one a specific,
evidence-backed discrepancy with a severity and a recommendation. An auditor reviews
the uncertain OCR reads, disambiguates any patient matches, works the findings queue,
and closes the audit with a report. Management opens the dashboard and sees, per
branch and per day: compliance rate, open findings, and the money at stake.

v1.0 is done when all six are true:

1. Every branch submits daily through the platform (no side channels).
2. OCR + review reads logbook pages with ≥ 95% field accuracy after human review, and
   auto-accepts enough that review takes minutes, not hours.
3. CRM discovery retrieves patient, treatment, invoice, and activity data without a
   human opening the CRM.
4. The matching engine converts every discrepancy into an AuditFinding — nothing is
   flagged by gut feel, everything by evidence.
5. Auditors work a single findings queue with statuses, and every audit ends in a
   generated report (PDF/Excel) management actually reads.
6. The dashboard answers "which branch should worry me today?" in one glance.

## The auditor's day (login → report)

1. **Login** → dashboard shows submissions awaiting review, oldest first.
2. **Open a submission** → OCR review: side-by-side page image and extracted fields;
   high-confidence fields are pre-accepted, amber ones need a glance, red ones need a
   decision. Typical page: under two minutes.
3. **Confirm pages** → matching runs against the CRM automatically; findings appear.
4. **Work the findings queue**, most severe first: each finding shows the logbook
   evidence, the CRM record, what disagreed, and a recommended action. The auditor
   marks findings reviewed, resolves them with a note, or escalates.
5. **Close the audit** → the report generates itself: compliance rate, findings by
   severity, money impact, resolution notes. The auditor sends it — they never
   assemble a spreadsheet again.

An auditor should complete a clean branch-day in **under 10 minutes**, and a
problematic one in under 30 — versus hours of manual cross-checking today.

## The branch manager's workflow

1. End of day: photograph the logbook pages, upload, reorder if needed, submit —
   phone-first, under two minutes, offline-tolerant retry if the connection drops.
2. Next day: see their submission's status and any findings assigned back to their
   branch ("explain the missing encoding for line 4"), with the evidence attached.
3. Respond to findings in-platform; watch their branch's compliance trend.

For an honest branch, the platform is a two-minute daily chore that protects them —
proof their books are clean. For a dishonest one, it is a daily, evidence-producing
adversary.

## Dashboard KPIs (v1.0)

| KPI                                                                      | Question it answers             |
| ------------------------------------------------------------------------ | ------------------------------- |
| **Compliance rate** (matched entries ÷ total entries, per branch/day)    | Are the books clean?            |
| **Open findings by severity** (critical/high called out)                 | What needs attention right now? |
| **Estimated money at stake** (unbilled treatments + post-hoc reductions) | What is this costing us?        |
| **Submission coverage** (branches submitted today ÷ active branches)     | Is anyone going dark?           |
| **Review turnaround** (submission → audit closed, median)                | Are audits keeping up?          |
| **Edit/deletion flags** (CRM records changed after audit date)           | Where is tampering suspected?   |
| **Branch leaderboard** (compliance trend, 30 days)                       | Who improved, who slipped?      |
| **OCR auto-accept rate** (fields ≥ 0.95 that survived review)            | Can we trust the machine more?  |

## How success is measured

**Business outcomes (the ones that matter):**

- Peso value of discrepancies caught per month — and its _decline_ over time, which is
  the deterrence effect actually working.
- 100% of active branches submitting daily within one month of rollout.
- Audit labor: from hours per branch-day to minutes (target: 10× reduction).

**Product health:**

- Median review turnaround < 24h; findings resolution rate > 90% within a week.
- False-positive rate on findings < 10% (resolved as "no issue") — the queue must stay
  trustworthy or auditors will ignore it.
- OCR field accuracy ≥ 95% post-review; auto-accept ≥ 60% of fields (measured, per
  [OCR_EVALUATION.md](OCR_EVALUATION.md) — never estimated).

**Trust guarantees (non-negotiable, already binding in the docs):**

- Submitted evidence is immutable; every finding cites its evidence; AI output never
  bypasses human review; every AI call is accountable and costed.

## Beyond 1.0 (direction, not commitment)

The audit vertical proves the pattern: _photograph the paper, extract with AI, verify
against the system of record, surface findings_. The same spine then extends to
inventory counts, sales remittance, and staff performance — the "AI Operations
Platform" the name promises. None of it starts before v1.0 earns its keep.
