import { Construction } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

interface ModulePlaceholderProps {
  moduleName: string;
  description: string;
  plannedMilestone?: string;
}

/** Standard "coming soon" body for modules scheduled in later milestones. */
export function ModulePlaceholder({
  moduleName,
  description,
  plannedMilestone,
}: ModulePlaceholderProps) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-muted">
          <Construction className="size-6 text-muted-foreground" aria-hidden="true" />
        </div>
        <div className="space-y-1">
          <h2 className="text-lg font-medium">{moduleName} module is under construction</h2>
          <p className="mx-auto max-w-md text-sm text-muted-foreground">{description}</p>
        </div>
        {plannedMilestone && <Badge variant="secondary">Planned for {plannedMilestone}</Badge>}
      </CardContent>
    </Card>
  );
}
