/**
 * Announcement interstitials (verified against the 2026-07-14 dashboard
 * capture + announcements.js). The CRM polls two blocking modals on EVERY
 * authenticated page — `#instant-announcement-modal` (re-polled every 5s,
 * `backdrop: 'static'`, Esc disabled) and `#announcement-checklist-modal`.
 *
 * Closing them "properly" is a WRITE: the Close button stays disabled until
 * staff tick "I have read the announcement. Do not show again" and sit
 * through a 5-second countdown, and clicking it POSTs
 * `announcements/mark-as-read` (with read-time metrics / checklist
 * completion). A read-only auditor must never do that — so automation
 * NEUTRALIZES the modals client-side instead: remove the nodes (which also
 * defeats the 5s re-poll — jQuery's `.modal('show')` on a missing element
 * no-ops) and clear the backdrop. No network call is made; the announcement
 * stays unread for real staff.
 *
 * Kept as a SOURCE STRING, not a function: transpiler helpers (`__name`)
 * do not exist inside the page (see PlaywrightBrowserDriver).
 */
export const NEUTRALIZE_ANNOUNCEMENTS_EXPRESSION = `(() => {
  var ids = ["instant-announcement-modal", "announcement-checklist-modal"];
  var removed = 0;
  for (var i = 0; i < ids.length; i++) {
    var el = document.getElementById(ids[i]);
    if (el) { el.parentNode.removeChild(el); removed++; }
  }
  var backdrops = document.querySelectorAll(".modal-backdrop");
  for (var j = 0; j < backdrops.length; j++) {
    backdrops[j].parentNode.removeChild(backdrops[j]);
  }
  document.body.classList.remove("modal-open");
  return removed;
})()`;
