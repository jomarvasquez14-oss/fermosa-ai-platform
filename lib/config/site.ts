export const siteConfig = {
  name: "Fermosa AI Platform",
  shortName: "Fermosa",
  description:
    "Internal enterprise platform for AI-powered audit, inventory, CRM, sales, marketing, and reporting modules.",
  url: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
} as const;
