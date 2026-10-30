// Zod 4 schemas for Places API (New) place details. Loose objects: Google adds
// fields often, and only the ones below are read.

import { z } from "zod";

const localizedText = z.looseObject({ text: z.string(), languageCode: z.string().optional() });

export const authorAttributionSchema = z.looseObject({
  displayName: z.string().optional(),
  uri: z.string().optional(),
  photoUri: z.string().optional(),
});

export const photoSchema = z.looseObject({
  name: z.string(),
  widthPx: z.number().optional(),
  heightPx: z.number().optional(),
  authorAttributions: z.array(authorAttributionSchema).optional(),
});

export const reviewSchema = z.looseObject({
  name: z.string().optional(),
  rating: z.number().optional(),
  relativePublishTimeDescription: z.string().optional(),
  publishTime: z.string().optional(),
  text: localizedText.optional(),
  originalText: localizedText.optional(),
  authorAttribution: authorAttributionSchema.optional(),
  googleMapsUri: z.string().optional(),
});

// google.type.Money: units is an int64 sent as a string.
const moneySchema = z.looseObject({
  currencyCode: z.string().optional(),
  units: z.union([z.string(), z.number()]).optional(),
  nanos: z.number().optional(),
});

const openingHoursSchema = z.looseObject({
  openNow: z.boolean().optional(),
  weekdayDescriptions: z.array(z.string()).optional(),
});

export const placeDetailsSchema = z.looseObject({
  id: z.string(),
  displayName: localizedText.optional(),
  formattedAddress: z.string().optional(),
  googleMapsUri: z.string().optional(),
  googleMapsLinks: z.looseObject({ photosUri: z.string().optional() }).optional(),
  primaryType: z.string().optional(),
  primaryTypeDisplayName: localizedText.optional(),
  businessStatus: z.string().optional(),
  location: z.looseObject({ latitude: z.number(), longitude: z.number() }).optional(),
  utcOffsetMinutes: z.number().optional(),
  photos: z.array(photoSchema).optional(),
  // full tier
  rating: z.number().optional(),
  userRatingCount: z.number().optional(),
  currentOpeningHours: openingHoursSchema.optional(),
  regularOpeningHours: openingHoursSchema.optional(),
  websiteUri: z.string().optional(),
  nationalPhoneNumber: z.string().optional(),
  priceLevel: z.string().optional(),
  reviews: z.array(reviewSchema).optional(),
  editorialSummary: localizedText.optional(),
  reservable: z.boolean().optional(),
  priceRange: z
    .looseObject({
      startPrice: moneySchema.optional(),
      endPrice: moneySchema.optional(),
    })
    .optional(),
});
export type RawPlaceDetails = z.infer<typeof placeDetailsSchema>;
