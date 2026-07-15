# How to fill the daily logbook spreadsheet

Two files per day, per branch:

- **transactions.csv** — one row per client SERVICE line.
- **daily-summary.csv** — the end-of-day totals (the logbook's second page).

## transactions.csv

Columns: date, branch, lineNumber, clientName, timeIn, timeOut, sessionNo, service, serviceAmount, cash, bank, med, medAmount, staff, bp, op, np

Rules:

1. **One row per service.** If a client had 3 services, use 3 rows and put the
   SAME `lineNumber` on all 3. Fill the client details (name, time, cash, staff,
   points) only on that client's FIRST row; leave them blank on the extra rows.
2. **lineNumber** is the client's number on the page (1, 2, 3, …). It groups the
   client's rows together — do not reuse a number for two different clients.
3. **Amounts:** just the number, no "₱" and no thousands comma. Write `1549`,
   not `₱1,549`. (The system ignores ₱ and commas anyway.)
4. **Blank = leave empty.** An empty cell means "nothing there", not zero.
5. **date** as `YYYY-MM-DD` (e.g. `2026-07-09`). **branch** is the branch name.

## daily-summary.csv

A two-column `field,value` list. Fill the `value` next to each field. Leave a
value blank if it does not apply that day. Fields: date, branch, censusOld, censusNew, salesPS, salesMC, salesTS, onlinePayment, onlinePaymentMode, commOvernight, otherExpenses, otherExpensesDetail, totalExpenses, totalCashClinic, pettyCash, medsSoaps, thermotipsEye, thermotipsFace, thermotipsBody, pointsBP, pointsOP, pointsNP, keyHolder, remarks, ledgerCheckedBy.

See `transactions.example.csv` and `daily-summary.example.csv` for a filled sample.
