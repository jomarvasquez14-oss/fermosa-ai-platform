import { AppSidebar } from "@/components/layout/app-sidebar";
import { Topbar } from "@/components/layout/topbar";
import { requireUser } from "@/lib/auth/session";

/**
 * Authenticated application shell: sidebar + top bar + content area.
 * Middleware already guards these routes; `requireUser` is defense in depth
 * and provides the typed session for the layout.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  return (
    <div className="min-h-svh">
      <AppSidebar role={user.role} />
      <div className="flex min-h-svh flex-col lg:pl-64">
        <Topbar
          user={{
            name: user.name ?? "Unknown User",
            email: user.email ?? "",
            role: user.role,
          }}
        />
        <main className="flex-1 space-y-6 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
