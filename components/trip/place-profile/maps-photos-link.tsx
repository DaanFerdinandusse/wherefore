/** Google's API returns 10 photos at most: this opens the rest on Google Maps. */
export function MapsPhotosLink({ href }: { href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="shrink-0 text-ui font-semibold text-ink underline decoration-ink/40 underline-offset-2"
    >
      See all on Google Maps
    </a>
  );
}
