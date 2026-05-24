import { ImageIcon, Newspaper, ShoppingBag, Video } from "lucide-react";
import { Badge } from "@/components/ui/badge";

type CreativeTypeBadgeProps = {
  type: string | null | undefined;
};

export function CreativeTypeBadge({ type }: CreativeTypeBadgeProps) {
  const normalizedType = type?.toLowerCase() ?? "unknown";
  const isVideo = normalizedType === "video";
  const isImage = normalizedType === "image";
  const isCatalog = normalizedType === "catalog";
  const isPost = normalizedType === "post";
  const Icon = isVideo ? Video : isCatalog ? ShoppingBag : isPost ? Newspaper : ImageIcon;

  return (
    <Badge variant={isVideo || isCatalog ? "default" : isImage || isPost ? "secondary" : "outline"} className="gap-1.5 capitalize">
      <Icon className="h-3 w-3" />
      {isVideo ? "Video" : isImage ? "Image" : isCatalog ? "Catalog" : isPost ? "Post" : normalizedType}
    </Badge>
  );
}
