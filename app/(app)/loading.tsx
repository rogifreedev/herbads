import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function AppSectionLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Skeleton className="h-4 w-40 bg-white/10" />
        <Skeleton className="h-12 w-72 bg-white/10" />
        <Skeleton className="h-3 w-52 bg-white/10" />
      </div>

      <Card className="border-herb-border bg-herb-surface/90">
        <CardHeader>
          <Skeleton className="h-5 w-44 bg-white/10" />
        </CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 8 }).map((_, index) => (
            <Skeleton key={index} className="h-12 w-full bg-white/10" />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
