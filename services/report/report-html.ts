import type { ReportModel } from "./report-builder";

/**
 * Deterministic, self-contained HTML renderer (M0046).
 *
 * PURE: no `Date.now()` / `new Date()` — every timestamp comes from the
 * model, which itself was stamped once by `getReport`. No `<script>`, no
 * external URLs (fonts, CDNs, images) — the document must open and print
 * correctly with zero network access. All interpolated values are
 * HTML-escaped at the point of use.
 */

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const esc = escapeHtml;

function severityLabel(severity: keyof ReportModel["severitySummary"]): string {
  return severity;
}

function renderFindingsTable(findings: ReportModel["findings"]): string {
  if (findings.length === 0) {
    return "<p>No findings were recorded for this submission.</p>";
  }
  const rows = findings
    .map(
      (f) => `
      <tr>
        <td>${esc(f.severity)}</td>
        <td>${esc(f.category)}</td>
        <td>${esc(f.status)}</td>
        <td>${esc(f.title)}</td>
        <td>${esc(f.detail)}</td>
        <td>${f.recommendation !== null ? esc(f.recommendation) : "&mdash;"}</td>
      </tr>`
    )
    .join("");
  return `
    <table>
      <thead>
        <tr>
          <th>Severity</th>
          <th>Category</th>
          <th>Status</th>
          <th>Title</th>
          <th>Detail</th>
          <th>Recommendation</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function renderTimeline(timeline: ReportModel["timeline"]): string {
  if (timeline.length === 0) return "<p>No timeline events.</p>";
  const items = timeline
    .map((entry) => `<li><strong>${esc(entry.at)}</strong> &mdash; ${esc(entry.label)}</li>`)
    .join("");
  return `<ul>${items}</ul>`;
}

function renderFindingSummary(findingSummary: ReportModel["findingSummary"]): string {
  const rows = Object.entries(findingSummary.byStatus)
    .map(([status, count]) => `<tr><td>${esc(status)}</td><td>${count}</td></tr>`)
    .join("");
  return `
    <p>Total findings: <strong>${findingSummary.total}</strong></p>
    <table>
      <thead><tr><th>Status</th><th>Count</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function renderSeveritySummary(severitySummary: ReportModel["severitySummary"]): string {
  const order: Array<keyof ReportModel["severitySummary"]> = [
    "CRITICAL",
    "HIGH",
    "MEDIUM",
    "LOW",
    "INFO",
  ];
  const rows = order
    .map((sev) => `<tr><td>${esc(severityLabel(sev))}</td><td>${severitySummary[sev]}</td></tr>`)
    .join("");
  return `
    <table>
      <thead><tr><th>Severity</th><th>Count</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function renderEvidence(evidence: ReportModel["evidence"]): string {
  if (evidence.length === 0) return "<p>No evidence snapshots are attached to this submission.</p>";
  const rows = evidence
    .map(
      (snap) => `
      <tr>
        <td>${esc(snap.crmPatientId)}</td>
        <td>${esc(snap.connectorKind)}</td>
        <td>${esc(snap.selectorVersion)}</td>
        <td>${esc(snap.retrievedAt)}</td>
        <td>${snap.counts.treatments}</td>
        <td>${snap.counts.invoices}</td>
        <td>${snap.counts.activity}</td>
        <td class="hash">${esc(snap.contentHash)}</td>
      </tr>`
    )
    .join("");
  return `
    <table>
      <thead>
        <tr>
          <th>Patient</th>
          <th>Connector</th>
          <th>Selector</th>
          <th>Retrieved</th>
          <th>Treatments</th>
          <th>Invoices</th>
          <th>Activity</th>
          <th>Content hash</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function renderRecommendations(recommendations: string[]): string {
  if (recommendations.length === 0) {
    return "<p>No corrective action was identified.</p>";
  }
  return `<ul>${recommendations.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>`;
}

function renderAppendix(appendix: ReportModel["appendix"]): string {
  const hashes =
    appendix.snapshotHashes.length === 0
      ? "<li>&mdash;</li>"
      : appendix.snapshotHashes.map((h) => `<li class="hash">${esc(h)}</li>`).join("");
  return `
    <dl>
      <dt>Connector kind</dt>
      <dd>${appendix.connectorKind !== null ? esc(appendix.connectorKind) : "&mdash;"}</dd>
      <dt>Selector version</dt>
      <dd>${appendix.selectorVersion !== null ? esc(appendix.selectorVersion) : "&mdash;"}</dd>
      <dt>Snapshot content hashes</dt>
      <dd><ul>${hashes}</ul></dd>
    </dl>`;
}

/** Inline, self-contained print CSS — no external stylesheets or fonts. */
const STYLE = `
  :root { color-scheme: light; }
  body {
    font-family: -apple-system, "Segoe UI", Arial, sans-serif;
    color: #1a1a1a;
    max-width: 860px;
    margin: 0 auto;
    padding: 2rem 1.5rem;
    line-height: 1.5;
  }
  h1 { font-size: 1.5rem; margin-bottom: 0.25rem; }
  h2 { font-size: 1.1rem; margin-top: 2rem; border-bottom: 1px solid #ccc; padding-bottom: 0.25rem; }
  h3 { font-size: 0.95rem; margin-top: 1rem; }
  table { width: 100%; border-collapse: collapse; margin-top: 0.5rem; font-size: 0.85rem; }
  th, td { text-align: left; padding: 0.35rem 0.5rem; border-bottom: 1px solid #ddd; vertical-align: top; }
  th { background: #f4f4f4; }
  .hash { font-family: monospace; word-break: break-all; }
  .meta { color: #555; font-size: 0.85rem; }
  dl { display: grid; grid-template-columns: max-content 1fr; gap: 0.25rem 1rem; }
  dt { font-weight: 600; }
  ul { margin: 0.25rem 0; padding-left: 1.25rem; }
  @media print {
    body { padding: 0; max-width: none; }
    h2 { break-after: avoid; }
    table, tr, td, th { break-inside: avoid; }
  }
`;

/** Pure, deterministic, self-contained HTML — no script, no network access. */
export function renderReportHtml(model: ReportModel): string {
  const s = model.submission;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Audit Report ${esc(s.id)}</title>
<style>${STYLE}</style>
</head>
<body>
  <h1>Audit Report</h1>
  <p class="meta">Generated ${esc(model.generatedAt)}</p>

  <h2>Executive Summary</h2>
  <p>
    This report summarizes audit submission <strong>${esc(s.id)}</strong> for
    <strong>${esc(s.branchName)}</strong>, audited on <strong>${esc(s.auditDate)}</strong>.
    It records <strong>${model.findingSummary.total}</strong> finding(s) and
    <strong>${model.evidence.length}</strong> evidence snapshot(s), built entirely from
    stored evidence.
  </p>

  <h2>Submission</h2>
  <dl>
    <dt>ID</dt><dd>${esc(s.id)}</dd>
    <dt>Audit date</dt><dd>${esc(s.auditDate)}</dd>
    <dt>Status</dt><dd>${esc(s.status)}</dd>
    <dt>Submitted at</dt><dd>${s.submittedAt !== null ? esc(s.submittedAt) : "&mdash;"}</dd>
  </dl>

  <h3>Branch</h3>
  <p>${esc(s.branchName)}</p>

  <h3>Auditor</h3>
  <p>${esc(s.auditorName)}</p>

  <h2>Timeline</h2>
  ${renderTimeline(model.timeline)}

  <h2>Finding Summary</h2>
  ${renderFindingSummary(model.findingSummary)}

  <h2>Severity Summary</h2>
  ${renderSeveritySummary(model.severitySummary)}

  <h2>Findings</h2>
  ${renderFindingsTable(model.findings)}

  <h2>Evidence</h2>
  ${renderEvidence(model.evidence)}

  <h2>Recommendations</h2>
  ${renderRecommendations(model.recommendations)}

  <h2>Appendix</h2>
  ${renderAppendix(model.appendix)}
</body>
</html>`;
}
