// Zod 4 schemas for every response the client reads. The API is rich (a place
// carries 100+ tags and a dozen description fields), so objects are loose: the
// fields this app relies on are typed and required, everything else passes
// through untouched for the raw `properties` block.

import { z } from "zod";

const nullish = <T extends z.ZodType>(schema: T) => schema.nullish();

export const latLonSchema = z.looseObject({ lat: z.number(), lon: z.number() });

// /search, /entities: { tag_id, name, type, value }. /v2/insights: { id, name, type, weight }.
export const rawTagSchema = z.looseObject({
  tag_id: z.string().optional(),
  id: z.string().optional(),
  name: z.string().nullish(),
  type: z.string().nullish(),
});

export const googlePlaceRefSchema = z.looseObject({
  id: z.string().nullish(),
  place_id: z.string().nullish(),
});

// The Google ids live in two shapes: an object under properties.external in
// /search and /entities, an array under the top-level external in /v2/insights.
export const externalSchema = z.looseObject({
  google_place: nullish(z.union([googlePlaceRefSchema, z.array(googlePlaceRefSchema)])),
});

const genreSchema = z.looseObject({ id: z.string(), name: z.string().nullish() });

export const placePropertiesSchema = z.looseObject({
  address: nullish(z.string()),
  neighborhood: nullish(z.string()),
  geocode: nullish(
    z.looseObject({
      name: nullish(z.string()),
      city: nullish(z.string()),
      country: nullish(z.string()),
      country_code: nullish(z.string()),
    }),
  ),
  price_level: nullish(z.number()),
  business_rating: nullish(z.number()),
  description: nullish(z.string()),
  short_description: nullish(z.string()),
  image: nullish(z.looseObject({ url: z.string() })),
  images: nullish(z.array(z.looseObject({ url: z.string(), type: nullish(z.string()) }))),
  primary_genre: nullish(genreSchema),
  external: nullish(externalSchema),
});

const explainabilityEntrySchema = z.looseObject({ entity_id: z.string(), score: z.number() });

export const placeQuerySchema = z.looseObject({
  affinity: z.number(),
  distance: nullish(z.number()),
  explainability: nullish(
    z.looseObject({
      "signal.interests.entities": nullish(z.array(explainabilityEntrySchema)),
    }),
  ),
});

/** Without signals the API sends no affinity. */
const unsignedQuerySchema = placeQuerySchema.extend({ affinity: nullish(z.number()) });

/** One place as /search, /entities or /v2/insights returns it. */
export const rawPlaceSchema = z.looseObject({
  entity_id: z.string(),
  name: z.string(),
  // /search and /entities: types[]; /v2/insights: subtype.
  types: nullish(z.array(z.string())),
  subtype: nullish(z.string()),
  disambiguation: nullish(z.string()),
  location: nullish(latLonSchema),
  properties: nullish(placePropertiesSchema),
  tags: nullish(z.array(rawTagSchema)),
  external: nullish(externalSchema),
  query: nullish(unsignedQuerySchema),
});
export type RawPlace = z.infer<typeof rawPlaceSchema>;

/** /v2/insights result with the per-result affinity we rank on. */
export const rawInsightPlaceSchema = rawPlaceSchema.extend({ query: placeQuerySchema });
export type RawInsightPlace = z.infer<typeof rawInsightPlaceSchema>;

const localitySchema = z.looseObject({
  entity_id: z.string(),
  name: z.string(),
  disambiguation: nullish(z.string()),
  location: nullish(latLonSchema),
});

export const insightsPlacesResponseSchema = z.looseObject({
  results: z.looseObject({ entities: z.array(rawInsightPlaceSchema) }),
  query: nullish(
    z.looseObject({
      localities: nullish(z.looseObject({ filter: nullish(z.array(localitySchema)) })),
    }),
  ),
});
export type InsightsPlacesResponse = z.infer<typeof insightsPlacesResponseSchema>;

/**
 * The same answer to a search without signals (a client with no favorites):
 * the API ranks the places itself and sends no affinity. With signals a missing
 * affinity is still an error, so this schema is only for that one case.
 */
export const unsignedPlacesResponseSchema = insightsPlacesResponseSchema.extend({
  results: z.looseObject({
    entities: z.array(rawPlaceSchema.extend({ query: unsignedQuerySchema })),
  }),
});
export type UnsignedPlacesResponse = z.infer<typeof unsignedPlacesResponseSchema>;

export const searchResponseSchema = z.looseObject({ results: z.array(rawPlaceSchema) });
export type SearchResponse = z.infer<typeof searchResponseSchema>;

export const rawLocalitySchema = z.looseObject({
  entity_id: z.string(),
  name: z.string(),
  disambiguation: nullish(z.string()),
  location: latLonSchema,
  properties: nullish(
    z.looseObject({
      boundaries: nullish(z.string()),
      place: nullish(z.string()),
      population: nullish(z.number()),
      ancestors: nullish(
        z.array(z.looseObject({ name: z.string(), place: nullish(z.string()), entity_id: nullish(z.string()) })),
      ),
    }),
  ),
});
export type RawLocality = z.infer<typeof rawLocalitySchema>;

export const localitySearchResponseSchema = z.looseObject({ results: z.array(rawLocalitySchema) });

export const entitiesResponseSchema = z.looseObject({ results: z.array(rawPlaceSchema) });

export const insightsTagsResponseSchema = z.looseObject({
  results: z.looseObject({
    tags: z.array(
      z.looseObject({
        tag_id: z.string(),
        name: z.string(),
        subtype: nullish(z.string()),
        query: nullish(z.looseObject({ affinity: nullish(z.number()) })),
      }),
    ),
  }),
});

export const tagsSearchResponseSchema = z.looseObject({
  results: z.looseObject({
    tags: z.array(z.looseObject({ id: z.string(), name: z.string(), type: nullish(z.string()) })),
  }),
});

export const insightsDestinationsResponseSchema = z.looseObject({
  results: z.looseObject({
    entities: z.array(
      z.looseObject({
        entity_id: z.string(),
        name: z.string(),
        location: nullish(latLonSchema),
        properties: nullish(
          z.looseObject({
            geocode: nullish(z.looseObject({ name: nullish(z.string()), country_code: nullish(z.string()) })),
          }),
        ),
        query: z.looseObject({ affinity: z.number() }),
      }),
    ),
  }),
});
