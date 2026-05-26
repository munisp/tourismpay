/**
 * Map & Location Router — geocoding, directions, and place search.
 */
import { z } from "zod";
import { router, publicProcedure } from "../_core/trpc";
import { geocode, reverseGeocode, getDirections, getMapConfig } from "../integrations/mapLocation";

export const mapLocationRouter = router({
  /** Get map configuration for the frontend. */
  config: publicProcedure.query(() => getMapConfig()),

  /** Forward geocode (address → coordinates). */
  geocode: publicProcedure
    .input(z.object({
      query: z.string().min(2).max(200),
      country: z.string().optional(),
    }))
    .query(async ({ input }) => geocode(input.query, { country: input.country })),

  /** Reverse geocode (coordinates → address). */
  reverseGeocode: publicProcedure
    .input(z.object({ latitude: z.number(), longitude: z.number() }))
    .query(async ({ input }) => reverseGeocode(input.latitude, input.longitude)),

  /** Get directions between two points. */
  directions: publicProcedure
    .input(z.object({
      from: z.tuple([z.number(), z.number()]),
      to: z.tuple([z.number(), z.number()]),
      profile: z.enum(["driving", "walking", "cycling"]).default("driving"),
    }))
    .query(async ({ input }) => getDirections(input.from, input.to, input.profile)),
});
