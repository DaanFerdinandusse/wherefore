import { z } from "zod";

// The body of POST /api/trips, shared by the trip bar (which builds it) and
// the route (which validates it). The client is the first traveler and
// drives the search; guests follow. A guest without a client id is a
// companion without favorites, kept so the trip can say whose taste is
// missing.

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date.");

export const destinationSchema = z.object({
  name: z.string().trim().min(1).max(120),
  disambiguation: z.string().trim().max(200).optional(),
  countryCode: z.string().trim().min(2).max(3).optional(),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  radiusM: z.number().positive().max(500_000),
  localityEntityId: z.string().trim().max(200).optional(),
});

export const guestSchema = z.object({
  name: z.string().trim().min(1).max(80),
  clientId: z.uuid().nullish(),
});

export const createTripRequestSchema = z
  .object({
    clientId: z.uuid(),
    destination: destinationSchema,
    datesMode: z.enum(["exact", "unset"]),
    startDate: isoDay.nullish(),
    endDate: isoDay.nullish(),
    adults: z.number().int().min(1).max(20),
    children: z.number().int().min(0).max(20),
    guests: z.array(guestSchema).max(12).default([]),
    title: z.string().trim().min(1).max(120).optional(),
  })
  .refine((body) => body.datesMode === "unset" || (body.startDate && body.endDate), {
    message: "Pick the first and the last day, or choose Not set yet.",
    path: ["endDate"],
  })
  .refine((body) => !body.startDate || !body.endDate || body.endDate >= body.startDate, {
    message: "The last day must be on or after the first day.",
    path: ["endDate"],
  });

export type CreateTripRequest = z.input<typeof createTripRequestSchema>;
export type CreateTripRequestParsed = z.output<typeof createTripRequestSchema>;

export type CreateTripResponse = { trip: { id: string; title: string }; chatId: string };
