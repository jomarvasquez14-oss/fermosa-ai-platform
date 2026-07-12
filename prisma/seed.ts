/**
 * Development seed data.
 * Run with: pnpm db:seed
 *
 * Default password for all seeded users: ChangeMe@123
 * Change these accounts before any non-local deployment.
 */
import { PrismaClient, RoleName } from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();

const DEFAULT_PASSWORD = "ChangeMe@123";

async function main() {
  console.log("Seeding database...");

  // --- Roles ---
  const roles = [
    { name: RoleName.SUPER_ADMIN, description: "Full access to every module and setting." },
    { name: RoleName.AUDITOR, description: "Views all branches and reports; runs audits." },
    { name: RoleName.BRANCH_MANAGER, description: "Access limited to the assigned branch." },
  ];

  for (const role of roles) {
    await prisma.role.upsert({
      where: { name: role.name },
      update: { description: role.description },
      create: role,
    });
  }
  console.log("  Roles seeded.");

  // --- Branches ---
  const branches = [
    { name: "Makati Branch", code: "MKT-001", address: "Ayala Avenue, Makati City" },
    { name: "Quezon City Branch", code: "QC-002", address: "Katipunan Avenue, Quezon City" },
    { name: "Cebu Branch", code: "CEB-003", address: "IT Park, Cebu City" },
  ];

  for (const branch of branches) {
    await prisma.branch.upsert({
      where: { code: branch.code },
      update: { name: branch.name, address: branch.address },
      create: branch,
    });
  }
  console.log("  Branches seeded.");

  // --- Users ---
  const passwordHash = await hash(DEFAULT_PASSWORD, 12);
  const makati = await prisma.branch.findUniqueOrThrow({ where: { code: "MKT-001" } });

  const users = [
    {
      fullName: "Platform Administrator",
      email: "admin@fermosa.local",
      roleName: RoleName.SUPER_ADMIN,
      branchCode: null as string | null,
    },
    {
      fullName: "Maria Santos",
      email: "auditor@fermosa.local",
      roleName: RoleName.AUDITOR,
      branchCode: null,
    },
    {
      fullName: "Ana Reyes",
      email: "manager@fermosa.local",
      roleName: RoleName.BRANCH_MANAGER,
      branchCode: makati.code,
    },
  ];

  for (const user of users) {
    const role = await prisma.role.findUniqueOrThrow({ where: { name: user.roleName } });
    const branch = user.branchCode
      ? await prisma.branch.findUniqueOrThrow({ where: { code: user.branchCode } })
      : null;

    await prisma.user.upsert({
      where: { email: user.email },
      update: { fullName: user.fullName, roleId: role.id, branchId: branch?.id ?? null },
      create: {
        fullName: user.fullName,
        email: user.email,
        passwordHash,
        roleId: role.id,
        branchId: branch?.id ?? null,
      },
    });
  }
  console.log("  Users seeded (password: ChangeMe@123).");

  // --- System settings ---
  const settings = [
    {
      key: "platform.maintenance_mode",
      value: false as unknown as object,
      description: "When true, non-admin users see a maintenance notice.",
    },
    {
      key: "audit.default_session_duration_minutes",
      value: 60 as unknown as object,
      description: "Default planned duration for a new audit session.",
    },
  ];

  for (const setting of settings) {
    await prisma.systemSetting.upsert({
      where: { key: setting.key },
      update: { value: setting.value, description: setting.description },
      create: setting,
    });
  }
  console.log("  System settings seeded.");

  console.log("Seed complete.");
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
