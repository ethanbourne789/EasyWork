import * as React from "react";
import { cn } from "@/lib/utils";

// 根据字符串生成稳定的 HSL 颜色
function stringToColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = hash % 360;
  return `hsl(${h}, 65%, 55%)`;
}

// 提取首字母（支持中文和英文）
function getInitials(name: string): string {
  if (!name) return "?";
  const trimmed = name.trim();
  if (!trimmed) return "?";
  
  // 如果是中文，取第一个字符
  if (/[\u4e00-\u9fa5]/.test(trimmed)) {
    return trimmed.charAt(0).toUpperCase();
  }
  
  // 如果是英文，取第一个单词的首字母或前两个单词的首字母
  const parts = trimmed.split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
  }
  return trimmed.charAt(0).toUpperCase();
}

interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  src?: string;
  alt?: string;
  name?: string;
  fallback?: string;
  size?: "sm" | "md" | "lg";
}

const sizeClasses = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-12 w-12 text-base",
};

export function Avatar({
  src,
  alt,
  name,
  fallback,
  size = "md",
  className,
  ...props
}: AvatarProps) {
  const [imageError, setImageError] = React.useState(false);
  const showFallback = !src || imageError;

  return (
    <div
      className={cn(
        "relative flex shrink-0 overflow-hidden rounded-full",
        sizeClasses[size],
        className
      )}
      {...props}
    >
      {showFallback ? (
        <div
          className="flex h-full w-full items-center justify-center font-medium text-white"
          style={{ backgroundColor: stringToColor(name || fallback || alt || "?") }}
        >
          {getInitials(name || fallback || alt || "?")}
        </div>
      ) : (
        <img
          src={src}
          alt={alt}
          className="aspect-square h-full w-full object-cover"
          onError={() => setImageError(true)}
        />
      )}
    </div>
  );
}
