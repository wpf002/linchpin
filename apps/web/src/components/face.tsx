import type { CSSProperties } from "react";
import { clsx } from "clsx";

const IGNORED_IN_INITIALS = /["'“”‘’().]/g;

/** First and last initial. Shown under the image, so it is what remains when there is none. */
export function initialsOf(name: string): string {
  const words = name.replace(IGNORED_IN_INITIALS, "").split(/\s+/).filter(Boolean);
  const first = words[0]?.charAt(0) ?? "";
  const last = words.length > 1 ? (words[words.length - 1]?.charAt(0) ?? "") : "";
  return `${first}${last}`.toUpperCase();
}

/**
 * A round portrait. The caller sets the size through className or style.
 * The image has empty alt text because the wrapper carries the name; a failed load leaves the initials.
 */
export function Face({
  name,
  imageUrl,
  title,
  className,
  style,
}: {
  name: string;
  imageUrl: string | null;
  title?: string;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      role="img"
      aria-label={name}
      title={title ?? name}
      style={style}
      className={clsx(
        "relative inline-flex aspect-square shrink-0 items-center justify-center overflow-hidden rounded-full bg-raised [container-type:inline-size]",
        className,
      )}
    >
      <span aria-hidden="true" className="font-display text-[38cqw] leading-none text-faint select-none">
        {initialsOf(name)}
      </span>
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- remote catalogue images, no optimizer configured
        <img
          src={imageUrl}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          className="absolute inset-0 size-full object-cover object-top"
        />
      ) : null}
    </span>
  );
}

/** A show poster at 2:3. Without an image it is the show's name on a plain panel. */
export function Poster({
  name,
  imageUrl,
  className,
}: {
  name: string;
  imageUrl: string | null;
  className?: string;
}) {
  return (
    <span
      role="img"
      aria-label={`${name} Poster`}
      className={clsx(
        "relative block aspect-[2/3] overflow-hidden rounded-[var(--radius-ui)] bg-raised [container-type:inline-size]",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="absolute inset-0 flex items-center justify-center p-[8cqw] text-center font-display text-[14cqw] leading-tight text-faint [overflow-wrap:anywhere]"
      >
        {name}
      </span>
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- remote catalogue images, no optimizer configured
        <img
          src={imageUrl}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          className="absolute inset-0 size-full object-cover"
        />
      ) : null}
    </span>
  );
}
