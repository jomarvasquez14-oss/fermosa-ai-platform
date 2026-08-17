import { CaptchaDetectedError } from "@/services/browser/types";
import { BasePage } from "./base-page";

/**
 * LoginPage — selectors VERIFIED against the 2026-07-14 capture (M0042A):
 * email + password fields in a Laravel POST form (hidden CSRF token travels
 * with the submit automatically). No CAPTCHA exists on the captured page;
 * the probe below stays as a tripwire in case one ever appears — automation
 * stops, never bypasses (CRM_DISCOVERY §5).
 */
export class LoginPage extends BasePage {
  readonly pageId = "login" as const;

  async detectCaptcha(): Promise<void> {
    if (await this.driver.isVisible(this.sel("captcha"))) {
      throw new CaptchaDetectedError(
        "The CRM presented a CAPTCHA. Automation stops here — a human must resolve it (never bypassed)."
      );
    }
  }

  async submitCredentials(username: string, password: string): Promise<void> {
    await this.assertFingerprint();
    await this.detectCaptcha();
    await this.driver.fill(this.sel("username"), username);
    await this.driver.fill(this.sel("password"), password);
    await this.driver.click(this.sel("submit"));
  }
}
