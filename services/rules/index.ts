/**
 * Rule engine (Sprint 3.7, ADR-030) — deterministic business rules over
 * confirmed OCR + normalized CRM data, emitting canonical FindingDrafts.
 * Pure module: no Prisma, no I/O — callers supply the context and persist
 * the findings (finding-service).
 */
export * from "./types";
export * from "./similarity";
export { BUILT_IN_RULES, entryKey } from "./rules";
export { RuleEngine, RuleRegistry, branchScore, createRuleEngine } from "./rule-engine";
