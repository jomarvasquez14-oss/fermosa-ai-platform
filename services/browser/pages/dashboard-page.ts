import { BasePage } from "./base-page";
import { NEUTRALIZE_ANNOUNCEMENTS_EXPRESSION } from "./interstitials";

/**
 * DashboardPage ("/") — the authenticated landing page. Used for the
 * "am I still logged in?" invariant and for neutralizing the announcement
 * interstitials (M0042A, verified against announcements.js): the CRM's two
 * blocking modals can only be CLOSED by ticking "I have read … do not show
 * again" and POSTing mark-as-read — a write a read-only auditor must never
 * perform. So automation removes the modal nodes client-side instead (which
 * also defeats the 5-second re-poll); no network call, and the announcement
 * stays unread for real staff.
 */
export class DashboardPage extends BasePage {
  readonly pageId = "dashboard" as const;

  /** Presence of the avatar dropdown = an authenticated session. */
  async isAuthenticated(): Promise<boolean> {
    return this.driver.isVisible(this.sel("userChrome"));
  }

  /**
   * Wait for the authenticated dashboard to appear, up to `timeoutMs`
   * (M0042). A form submit triggers an async redirect the click does NOT
   * wait for, so an instant `isAuthenticated` races the live server — this
   * waits for the avatar to render before deciding login failed.
   */
  async waitUntilAuthenticated(timeoutMs: number): Promise<boolean> {
    try {
      await this.driver.waitFor(this.sel("userChrome"), { state: "visible", timeoutMs });
      return true;
    } catch {
      return false;
    }
  }

  /** Neutralize any announcement interstitial the CRM raised (read-only). */
  async dismissAnnouncements(): Promise<void> {
    if (!(await this.driver.isVisible(this.sel("announcementModals")))) return;
    await this.driver.evaluate(NEUTRALIZE_ANNOUNCEMENTS_EXPRESSION);
  }
}
