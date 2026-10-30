import type { ImageProps } from "next/image";

import { cn } from "@/lib/ui/cn";
import { initials } from "@/lib/ui/initials";

import { FilmImage } from "./film-image";

// A person: a photo when there is one, initials otherwise. Round at list
// sizes (26 on trip cards, 34 in the panel header, 38 in the app bar, 44 in menus, 48 in the traveler
// footer) and a tall stadium on the client profile. `dashed` is the empty
// avatar of a new client or a guest without favorites; `ink` is the signed-in
// advisor in the app bar.
export type AvatarSize = 26 | 32 | 34 | 38 | 44 | 48 | "profile";

const sizeBox: Record<Exclude<AvatarSize, "profile">, number> = { 26: 26, 32: 32, 34: 34, 38: 38, 44: 44, 48: 48 };

const initialsType: Record<AvatarSize, string> = {
  26: "font-sans text-micro font-semibold",
  32: "font-sans text-meta font-semibold",
  34: "font-sans text-meta font-semibold",
  38: "font-sans text-ui-sm leading-4 font-semibold",
  44: "font-display text-lg leading-5",
  48: "font-sans text-action font-semibold",
  profile: "font-display text-initials",
};

export function Avatar({
  name,
  src,
  size = 38,
  tone = "soft",
  className,
}: {
  name: string;
  src?: ImageProps["src"];
  size?: AvatarSize;
  tone?: "soft" | "ink" | "dashed";
  className?: string;
}) {
  const box = size === "profile" ? { width: 84, height: 116 } : { width: sizeBox[size], height: sizeBox[size] };
  return (
    <span
      role="img"
      aria-label={name}
      style={box}
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-pill",
        tone === "soft" && "bg-avatar text-ink",
        tone === "ink" && "bg-ink text-surface",
        tone === "dashed" && "border border-dashed border-nav-pill text-ink",
        initialsType[size],
        className,
      )}
    >
      {src ? (
        <FilmImage src={src} alt="" sizes={`${box.width}px`} />
      ) : (
        <span aria-hidden>{initials(name)}</span>
      )}
    </span>
  );
}
