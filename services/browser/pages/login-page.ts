import { CaptchaDetectedError } from "@/services/browser/types";
import { BasePage } from "./base-page";

/**
 * LoginPage — the ONE page the captures never included (CRM_DISCOVERY §8).
 * Its v1 selectors are provisional; the fingerprint is deliberately minimal
 * (a password field) so a wrong guess fails as CRM_LAYOUT on the first live
 * run instead of submitting credentials into the void.
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
