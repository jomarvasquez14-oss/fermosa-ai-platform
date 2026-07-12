import {
  Building2,
  CheckCircle2,
  ClipboardList,
  Gauge,
  Upload,
  type LucideIcon,
} from "lucide-react";

/**
 * Placeholder dashboard data for Milestone 1.
 * Milestone 2 replaces this with real aggregates from the service layer.
 */

export interface DashboardStat {
  key: string;
  title: string;
  value: string;
  hint: string;
  icon: LucideIcon;
}

export const DASHBOARD_STATS: readonly DashboardStat[] = [
  {
    key: "branches",
    title: "Branches",
    value: "12",
    hint: "Active locations",
    icon: Building2,
  },
  {
    key: "todays-uploads",
    title: "Today's Uploads",
    value: "48",
    hint: "Logbook pages received",
    icon: Upload,
  },
  {
    key: "pending-audits",
    title: "Pending Audits",
    value: "7",
    hint: "Awaiting review",
    icon: ClipboardList,
  },
  {
    key: "completed-audits",
    title: "Completed Audits",
    value: "132",
    hint: "This month",
    icon: CheckCircle2,
  },
  {
    key: "compliance-rate",
    title: "Compliance Rate",
    value: "94.2%",
    hint: "Rolling 30 days",
    icon: Gauge,
  },
];

export interface ActivityItem {
  id: string;
  actor: string;
  action: string;
  target: string;
  timestamp: string;
}

export const RECENT_ACTIVITY: readonly ActivityItem[] = [
  {
    id: "1",
    actor: "Maria Santos",
    action: "completed an audit for",
    target: "Makati Branch",
    timestamp: "12 minutes ago",
  },
  {
    id: "2",
    actor: "Jomar Vasquez",
    action: "uploaded a logbook to",
    target: "Quezon City Branch",
    timestamp: "41 minutes ago",
  },
  {
    id: "3",
    actor: "System",
    action: "flagged a compliance gap at",
    target: "Cebu Branch",
    timestamp: "2 hours ago",
  },
  {
    id: "4",
    actor: "Ana Reyes",
    action: "started an audit session for",
    target: "Davao Branch",
    timestamp: "3 hours ago",
  },
  {
    id: "5",
    actor: "Maria Santos",
    action: "updated branch details for",
    target: "Pasig Branch",
    timestamp: "Yesterday",
  },
];
