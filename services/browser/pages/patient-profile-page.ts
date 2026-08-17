import { normalizeText, toIsoDate } from "@/services/browser/utils/parse";
import { BasePage } from "./base-page";

/**
 * PatientProfilePage ("/clients/{cid}") — profile card, demographics, and
 * the tab strip (Treatment Records · Profile · Appointments · Invoice).
 * READ-ONLY BY CONSTRUCTION: demographics are read from the CRM's own edit
 * form's input values, but no method exists that submits, edits, locks,
 * deletes, or creates anything (PROJECT_RULES #24; the `neverInteract` list
 * in the selector map names the observed mutating controls).
 */

export const PROFILE_TABS = {
  "treatment-records": "tabTreatmentRecords",
  "client-profile": "tabProfile",
  appointments: "tabAppointments",
  invoice: "tabInvoice",
} as const;
export type ProfileTab = keyof typeof PROFILE_TABS;

export interface PatientDemographics {
  firstName: string | null;
  middleName: string | null;
  lastName: string | null;
  nickname: string | null;
  email: string | null;
  mobileNo: string | null;
  dateOfBirth: string | null;
}

export class PatientProfilePage extends BasePage {
  readonly pageId = "patient-profile" as const;

  pathFor(crmId: string): string {
    return this.path.replace("{cid}", crmId);
  }

  async open(crmId: string): Promise<void> {
    await this.driver.goto(this.pathFor(crmId));
    await this.assertFingerprint();
  }

  /** The cid is the durable identity — always read it from the URL. */
  async crmIdFromUrl(): Promise<string | null> {
    const url = await this.driver.currentUrl();
    return url.match(/\/clients\/(\d+)/)?.[1] ?? null;
  }

  async openTab(tab: ProfileTab): Promise<void> {
    await this.driver.click(this.sel(PROFILE_TABS[tab]));
    // The pane is display:none until Bootstrap activates it — visibility of
    // the pane's fingerprint doubles as "the tab is actually open".
    const paneSelector = `#${tab}`;
    await this.driver.waitFor(paneSelector, { state: "visible" });
  }

  /** "Last, First M." + contact lines from the avatar card. */
  async readPatientCard(): Promise<{ fullName: string }> {
    const card = await this.driver.text(this.sel("profileCard"));
    const fullName = normalizeText(card.split("\n")[0] ?? card.split("@")[0] ?? "");
    return { fullName };
  }

  async readDemographics(): Promise<PatientDemographics> {
    return {
      firstName: await this.inputValue("firstNameInput"),
      middleName: await this.inputValue("middleNameInput"),
      lastName: await this.inputValue("lastNameInput"),
      nickname: await this.inputValue("nicknameInput"),
      email: await this.inputValue("emailInput"),
      mobileNo: await this.inputValue("mobileInput"),
      dateOfBirth: toIsoDate(await this.inputValue("dobInput")),
    };
  }

  /**
   * The lock control toggles: "Lock Records" shown = currently unlocked,
   * an "Unlock" variant = locked. Absence means the account can't see the
   * control — treated as unlocked, never as an error.
   */
  async isTreatmentLocked(): Promise<boolean> {
    const texts = await this.driver.locator(this.sel("lockLink")).texts();
    if (texts.length === 0) return false;
    return /unlock/i.test(texts[0] ?? "");
  }

  private async inputValue(key: string): Promise<string | null> {
    const values = await this.driver.locator(this.sel(key)).values();
    const value = normalizeText(values[0] ?? "");
    return value.length > 0 ? value : null;
  }
}
