import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function ClientSectionLoading() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div className="space-y-3">
          <Skeleton className="h-4 w-40 bg-white/10" />
          <Skeleton className="h-12 w-72 bg-white/10" />
          <Skeleton className="h-3 w-52 bg-white/10" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-10 w-44 bg-white/10" />
          <Skeleton className="h-10 w-36 bg-white/10" />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-9 w-28 rounded-lg bg-white/10" />
        ))}
      </div>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5">
        {Array.from({ length: 10 }).map((_, index) => (
          <Card key={index} className="border-herb-border bg-herb-surface/90">
            <CardContent className="space-y-3 pt-6">
              <Skeleton className="h-3 w-16 bg-white/10" />
              <Skeleton className="h-7 w-24 bg-white/10" />
              <Skeleton className="h-3 w-20 bg-white/10" />
            </CardContent>
          </Card>
        ))}
      </section>

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
