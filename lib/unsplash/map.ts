import { z } from "zod";

import type { TripCover } from "@/lib/contracts";

// The Unsplash search response as a trip cover. Pure, so it runs in tests
// without a key. Unsplash requires a credit with utm params on every link, and
// a ping to the photo's download endpoint when the photo is used, so both
// travel with the result. Reference: https://unsplash.com/documentation

export const UNSPLASH_API_URL = "https://api.unsplash.com";

const UTM = { utm_source: "wherefore", utm_medium: "referral" };

/** A photo to use as a cover, and where to report that it was used. */
export type CoverPhoto = { cover: TripCover; downloadLocation: string };

const searchSchema = z.object({ results: z.array(z.unknown()) });

const photoSchema = z.object({
  urls: z.object({ regular: z.url() }),
  alt_description: z.string().nullish(),
  description: z.string().nullish(),
  user: z.object({ name: z.string().trim().min(1), links: z.object({ html: z.url() }) }),
  links: z.object({ download_location: z.url().startsWith(`${UNSPLASH_API_URL}/`) }),
});

/** The link with the utm params Unsplash asks for. */
export function creditLink(url: string): string {
  const link = new URL(url);
  for (const [key, value] of Object.entries(UTM)) link.searchParams.set(key, value);
  return link.toString();
}

/** The first photo of a search response with everything a cover needs, else null. */
export function firstCoverPhoto(payload: unknown): CoverPhoto | null {
  const search = searchSchema.safeParse(payload);
  if (!search.success) return null;
  for (const entry of search.data.results) {
    const photo = photoSchema.safeParse(entry);
    if (!photo.success) continue;
    const { urls, alt_description, description, user, links } = photo.data;
    return {
      cover: {
        url: urls.regular,
        alt: alt_description?.trim() || description?.trim() || "",
        creditName: user.name,
        creditUrl: creditLink(user.links.html),
      },
      downloadLocation: links.download_location,
    };
  }
  return null;
}
