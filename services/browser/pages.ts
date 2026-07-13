import { BasePage } from "./base-page";
import { browserError, type PageId } from "./types";

/**
 * Page objects for the six CRM pages (Sprint 3.9). Behavior only —
 * selectors live in the registry, structure checks in BasePage.
 * Operations are the read-only set CRM_DISCOVERY sanctions.
 */

export class LoginPage extends BasePage {
  readonly pageId = "login" as const;

  async detectCaptcha(): Promise<void> {
    if (await this.driver.isVisible(this.sel("captcha"))) {
      throw browserError(
        "CRM_CHALLENGE",
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

export class DashboardPage extends BasePage {
  readonly pageId = "dashboard" as const;

  /** Presence of the user chrome = an authenticated session. */
  async isAuthenticated(): Promise<boolean> {
    return this.driver.isVisible(this.sel("userChrome"));
  }
}

export class PatientSearchPage extends BasePage {
  readonly pageId = "patient-search" as const;

  async searchByName(name: string): Promise<number> {
    await this.assertFingerprint();
    await this.driver.fill(this.sel("nameInput"), name);
    await this.driver.click(this.sel("searchButton"));
    const rows = await this.driver.readText(this.sel("resultRows"));
    return rows ? Number(rows) || 0 : 0;
  }
}

export class PatientProfilePage extends BasePage {
  readonly pageId = "patient-profile" as const;

  async readPatientName(): Promise<string | null> {
    await this.assertFingerprint();
    return this.driver.readText(this.sel("patientName"));
  }
}

export class InvoicePage extends BasePage {
  readonly pageId = "invoice" as const;
}

export class ActivityLogPage extends BasePage {
  readonly pageId = "activity-log" as const;
}

type PageConstructor = new (
  driver: ConstructorParameters<typeof BasePage>[0],
  registry: ConstructorParameters<typeof BasePage>[1]
) => BasePage;

export const PAGE_CLASSES: Record<PageId, PageConstructor> = {
  login: LoginPage,
  dashboard: DashboardPage,
  "patient-search": PatientSearchPage,
  "patient-profile": PatientProfilePage,
  invoice: InvoicePage,
  "activity-log": ActivityLogPage,
};
