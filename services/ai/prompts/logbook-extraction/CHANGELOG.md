# logbook-extraction — prompt changelog

One line per version. Versions are immutable once any persisted OcrResult
references them (OCR_ARCHITECTURE.md §3).

- **v001** (2026-07-13, Sprint 3.0): initial DRAFT. Assumed columns
  patient / treatment / therapist / time — to be confirmed against real
  logbook page samples before the first real provider call.
- **v002** (2026-07-15, M0059): ACTIVE. Confirmed against 189 real branch
  logbook samples. Per-patient-full columns (schema v2): patientName, staff,
  time in/out, #/SS, services[]+amounts, meds[]+amounts, cash/bank, BP/OP/NP.
  Daily financial rollup deferred to a later version.
