import Image from "next/image";
import { cn } from "@/lib/utils";

type Props = {
  className?: string;
  title?: string;
};

const BRAND_LOGO_SRC = "/smoat-logo.png";

export function BrandMark({ className, title = "SMOAT" }: Props) {
  return (
    <Image
      src={BRAND_LOGO_SRC}
      alt={title}
      width={500}
      height={500}
      className={cn("object-cover", className)}
      priority={false}
    />
  );
}

type BrandIconProps = Props & {
  markClassName?: string;
};

export function BrandIcon({
  className,
  markClassName,
  title = "SMOAT",
}: BrandIconProps) {
  return (
    <span
      className={cn(
        "flex size-9 items-center justify-center overflow-hidden rounded-2xl bg-transparent shadow-[0_16px_32px_-22px_rgba(15,23,42,0.8)] transition",
        className,
      )}
    >
      <Image
        src={BRAND_LOGO_SRC}
        alt={title}
        width={500}
        height={500}
        className={cn("object-cover", markClassName)}
        style={{ width: "100%", height: "100%" }}
        priority={false}
      />
    </span>
  );
}
