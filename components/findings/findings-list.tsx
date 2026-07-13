"use client";

import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { FindingCard } from "./finding-card";
import { sortFindings } from "./findings-summary";
import {
  FINDING_CATEGORIES,
  FINDING_CATEGORY_LABELS,
  FINDING_SEVERITIES,
  FINDING_STATUSES,
  type FindingStatus,
  type FindingView,
} from "./types";

const selectClass =
  "h-9 rounded-md border border-input bg-transparent px-2.5 text-sm shadow-xs " +
  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none dark:bg-input/30";

interface FindingsListProps {
  findings: readonly FindingView[];
  onStatusChange: (id: string, status: FindingStatus) => void;
}

/**
 * Filterable, severity-sorted findings list with one-at-a-time inspection.
 * Stateless about the findings themselves — status changes bubble up.
 */
export function FindingsList({ findings, onStatusChange }: FindingsListProps) {
  const [severity, setSeverity] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [category, setCategory] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const visible = useMemo(
    () =>
      sortFindings(
        findings.filter(
          (finding) =>
            (severity === "all" || finding.severity === severity) &&
            (status === "all" || finding.status === status) &&
            (category === "all" || finding.category === category)
        )
      ),
    [findings, severity, status, category]
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Finding filters">
        <label className="sr-only" htmlFor="filter-severity">
          Filter by severity
        </label>
        <select
          id="filter-severity"
          className={selectClass}
          value={severity}
          onChange={(event) => setSeverity(event.target.value)}
        >
          <option value="all">All severities</option>
          {FINDING_SEVERITIES.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="filter-status">
          Filter by status
        </label>
        <select
          id="filter-status"
          className={selectClass}
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          <option value="all">All statuses</option>
          {FINDING_STATUSES.map((value) => (
            <option key={value} value={value}>
              {value.toLowerCase()}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="filter-category">
          Filter by category
        </label>
        <select
          id="filter-category"
          className={selectClass}
          value={category}
          onChange={(event) => setCategory(event.target.value)}
        >
          <option value="all">All categories</option>
          {FINDING_CATEGORIES.map((value) => (
            <option key={value} value={value}>
              {FINDING_CATEGORY_LABELS[value]}
            </option>
          ))}
        </select>
        <p className="ml-auto text-sm text-muted-foreground" role="status">
          {visible.length} of {findings.length} finding{findings.length === 1 ? "" : "s"}
        </p>
      </div>

      {visible.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No findings match these filters.
          </CardContent>
        </Card>
      ) : (
        <ul aria-label="Audit findings" className="m-0 flex list-none flex-col gap-2 p-0">
          {visible.map((finding) => (
            <li key={finding.id}>
              <FindingCard
                finding={finding}
                expanded={expandedId === finding.id}
                onToggle={(id) => setExpandedId((current) => (current === id ? null : id))}
                onStatusChange={onStatusChange}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
