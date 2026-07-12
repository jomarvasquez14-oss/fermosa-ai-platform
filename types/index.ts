/** Shared cross-cutting types. Feature-specific types live inside features/<module>. */

export type { AppRole, Permission } from "@/lib/auth/roles";

/** Standard shape for server action / service results. */
export type ActionResult<T = undefined> =
  { success: true; data: T } | { success: false; error: string };

/** Pagination conventions used across list endpoints (Milestone 2+). */
export interface PaginationParams {
  page: number;
  pageSize: number;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
