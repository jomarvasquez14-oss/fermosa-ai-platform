import { InvalidStateError } from "@/lib/errors";
import type { FindingDraft } from "@/lib/findings";
import { BUILT_IN_RULES } from "./rules";
import { EXTENDED_RULES } from "./rules-extended";
import {
  DEFAULT_RULE_CONFIG,
  type EvaluationReport,
  type Rule,
  type RuleContext,
  type RuleEngineConfig,
  type RuleResult,
} from "./types";

/**
 * RuleRegistry — pluggable rule catalog. Registering twice with the same id
 * is a wiring bug and fails loudly.
 */
export class RuleRegistry {
  private readonly rules = new Map<string, Rule>();

  register(rule: Rule): this {
    if (this.rules.has(rule.id)) {
      throw new InvalidStateError(`Rule "${rule.id}" is already registered.`);
    }
    this.rules.set(rule.id, rule);
    return this;
  }

  get(id: string): Rule | undefined {
    return this.rules.get(id);
  }

  all(): Rule[] {
    return [...this.rules.values()];
  }
}

/**
 * RuleEvaluator / RuleEngine (Sprint 3.7, ADR-030): runs every enabled rule
 * over a context, collects findings, and computes weighted risk scores.
 * Deterministic and synchronous — this is business logic, not AI.
 */
export class RuleEngine {
  constructor(
    private readonly registry: RuleRegistry,
    private readonly config: RuleEngineConfig = DEFAULT_RULE_CONFIG
  ) {}

  evaluate(context: Omit<RuleContext, "config">): EvaluationReport {
    const started = performance.now();
    const fullContext: RuleContext = { ...context, config: this.config };

    const results: RuleResult[] = [];
    for (const rule of this.registry.all()) {
      if (this.config.rules[rule.id]?.enabled === false) continue;
      results.push(...rule.evaluate(fullContext));
    }

    const findings: FindingDraft[] = results
      .filter((result) => result.outcome !== "pass" && result.finding)
      .map((result) => result.finding!);

    const riskScore = Math.min(
      100,
      Math.round(
        results.reduce((total, result) => {
          if (result.outcome === "pass" || !result.finding) return total;
          const rule = this.registry.get(result.ruleId);
          const weight = this.config.rules[result.ruleId]?.weight ?? rule?.defaultWeight ?? 1;
          return total + this.config.severityWeights[result.finding.severity] * weight;
        }, 0)
      )
    );

    return {
      results,
      findings,
      scores: { riskScore, submissionScore: 100 - riskScore },
      durationMs: performance.now() - started,
    };
  }
}

/** Average of submission scores — the branch-level compliance number. */
export function branchScore(submissionScores: number[]): number | null {
  if (submissionScores.length === 0) return null;
  return Math.round(
    submissionScores.reduce((total, score) => total + score, 0) / submissionScores.length
  );
}

/** Default engine: all built-in rules plus the extended (M0047) rules, default configuration. */
export function createRuleEngine(config?: Partial<RuleEngineConfig>): RuleEngine {
  const registry = new RuleRegistry();
  for (const rule of [...BUILT_IN_RULES, ...EXTENDED_RULES]) registry.register(rule);
  return new RuleEngine(registry, { ...DEFAULT_RULE_CONFIG, ...config });
}
