import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RECENT_ACTIVITY } from "@/features/dashboard/data/placeholder-stats";
import { getInitials } from "@/utils/format";

export function RecentActivity() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Activity</CardTitle>
        <CardDescription>Latest events across all branches</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-5">
          {RECENT_ACTIVITY.map((item) => (
            <li key={item.id} className="flex items-start gap-3">
              <Avatar className="size-8">
                <AvatarFallback className="text-xs">{getInitials(item.actor)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1 text-sm">
                <p className="leading-snug">
                  <span className="font-medium">{item.actor}</span>{" "}
                  <span className="text-muted-foreground">{item.action}</span>{" "}
                  <span className="font-medium">{item.target}</span>
                </p>
                <p className="text-xs text-muted-foreground">{item.timestamp}</p>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
