import Link from "next/link";
import { cn } from "@/lib/utils";

type Props = {
  clientId: string;
  active: "batches" | "settings";
};

export function BatchesSectionNav({ clientId, active }: Props) {
  const items = [
    { id: "batches", label: "Batches", href: `/clients/${clientId}/batches` },
    { id: "settings", label: "Settings", href: `/clients/${clientId}/batches/settings` }
  ] as const;

  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <Link
          key={item.id}
          href={item.href}
          className={cn(
            "rounded-lg border px-3 py-2 text-sm transition",
            active === item.id ? "border-primary bg-primary text-white" : "border-herb-border bg-black/20 text-white/65 hover:border-primary/60 hover:text-white"
          )}
        >
          {item.label}
        </Link>
      ))}
    </div>
  );
}
