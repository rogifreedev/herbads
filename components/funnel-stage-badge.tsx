import { Badge } from "@/components/ui/badge";

type FunnelStageBadgeProps = {
  stage: string | null | undefined;
};

export function FunnelStageBadge({ stage }: FunnelStageBadgeProps) {
  const normalizedStage = stage?.toUpperCase();

  if (!normalizedStage) {
    return <Badge variant="outline">Nicht klassifiziert</Badge>;
  }

  const variant = normalizedStage === "BOFU" ? "success" : normalizedStage === "MOFU" ? "warning" : "secondary";
  return <Badge variant={variant}>{normalizedStage}</Badge>;
}
