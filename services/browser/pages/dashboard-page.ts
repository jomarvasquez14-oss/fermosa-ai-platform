import { LayoutChangedError } from "@/services/browser/types";
import { BasePage } from "./base-page";

/**
 * DashboardPage ("/") — the authenticated landing page. Used for the
 * "am I still logged in?" invariant and for dismissing the announcement
 * interstitial the CRM shows after login (CRM_DISCOVERY §5). Dismissal
 * closes the modal only — it never ticks "do not show again" (that would
 * mutate an operator preference).
 */
export class DashboardPage extends BasePage {
  readonly pageId = "dashboard" as const;

  /** Presence of the avatar dropdown = an authenticated session. */
  async isAuthenticated(): Promise<boolean> {
    return this.driver.isVisible(this.sel("userChrome"));
  }

  /** Close the announcement modal if the CRM raised it. */
  async dismissAnnouncements(): Promise<void> {
    if (!(await this.driver.isVisible(this.sel("announcementModal")))) return;
    if (!(await this.driver.isVisible(this.sel("announcementDismiss")))) {
      throw new LayoutChangedError(
        `The announcement modal is open but its dismiss control is missing (${this.registry.version}).`
      );
    }
    await this.driver.click(this.sel("announcementDismiss"));
  }
}
