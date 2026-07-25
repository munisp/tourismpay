/**
 * Global Registry Router
 * Exposes countries, cities, currencies, payment rails, tax rules,
 * and diaspora corridors to the frontend for all journey flows.
 */
import { z } from "zod";
import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import {
  COUNTRIES, CITIES, CURRENCIES, PAYMENT_RAILS, DIASPORA_CORRIDORS,
  SUPPORTED_COUNTRIES, DESTINATION_HUBS, AFRICAN_COUNTRIES, FIAT_CURRENCIES,
  STABLECOINS, SUPPORTED_CURRENCIES,
  calculateTax, getPaymentRails, getPrimaryAirport, getSettlementDays,
  getKybDocuments, getCitiesForCountry, getTouristDestinations,
} from "../_core/global-registry";

export const globalRegistryRouter = router({

  // ── COUNTRIES ──────────────────────────────────────────────────────────────
  listCountries: publicProcedure
    .input(z.object({
      region: z.string().optional(),
      destinationOnly: z.boolean().optional(),
      africanOnly: z.boolean().optional(),
    }))
    .query(({ input }) => {
      let codes = SUPPORTED_COUNTRIES;
      if (input.destinationOnly) codes = DESTINATION_HUBS;
      if (input.africanOnly) codes = AFRICAN_COUNTRIES;
      if (input.region) codes = codes.filter(c => COUNTRIES[c]?.region === input.region);
      return codes.map(code => ({
        code,
        name: COUNTRIES[code].name,
        region: COUNTRIES[code].region,
        currency: COUNTRIES[code].currency,
        dialCode: COUNTRIES[code].dialCode,
        languages: COUNTRIES[code].languages,
        vatRate: COUNTRIES[code].vatRate,
        vatName: COUNTRIES[code].vatName,
        hasVat: COUNTRIES[code].hasVat,
        paymentMethods: COUNTRIES[code].paymentMethods,
        timezone: COUNTRIES[code].timezone,
        isDestinationHub: COUNTRIES[code].isDestinationHub,
        airports: COUNTRIES[code].airports,
        regulatoryBody: COUNTRIES[code].regulatoryBody,
      }));
    }),

  getCountry: publicProcedure
    .input(z.object({ code: z.string().length(2).toUpperCase() }))
    .query(({ input }) => {
      const country = COUNTRIES[input.code.toUpperCase()];
      if (!country) return null;
      return country;
    }),

  // ── CITIES ─────────────────────────────────────────────────────────────────
  listCities: publicProcedure
    .input(z.object({
      countryCode: z.string().optional(),
      touristHubsOnly: z.boolean().optional(),
    }))
    .query(({ input }) => {
      let cities = Object.values(CITIES);
      if (input.countryCode) cities = cities.filter(c => c.countryCode === input.countryCode.toUpperCase());
      if (input.touristHubsOnly) cities = cities.filter(c => c.isTouristHub);
      return cities;
    }),

  getTouristDestinations: publicProcedure.query(() => getTouristDestinations()),

  // ── CURRENCIES ─────────────────────────────────────────────────────────────
  listCurrencies: publicProcedure
    .input(z.object({
      fiatOnly: z.boolean().optional(),
      stablesOnly: z.boolean().optional(),
      cryptoOnly: z.boolean().optional(),
    }))
    .query(({ input }) => {
      let codes = SUPPORTED_CURRENCIES;
      if (input.fiatOnly) codes = FIAT_CURRENCIES;
      if (input.stablesOnly) codes = STABLECOINS;
      if (input.cryptoOnly) codes = codes.filter(c => CURRENCIES[c]?.isCrypto);
      return codes.map(code => CURRENCIES[code]);
    }),

  getCurrency: publicProcedure
    .input(z.object({ code: z.string().min(3).max(6).toUpperCase() }))
    .query(({ input }) => CURRENCIES[input.code.toUpperCase()] ?? null),

  // ── PAYMENT RAILS ──────────────────────────────────────────────────────────
  getPaymentRails: publicProcedure
    .input(z.object({
      fromCurrency: z.string(),
      toCurrency: z.string(),
      fromCountry: z.string(),
    }))
    .query(({ input }) => {
      return getPaymentRails(
        input.fromCurrency.toUpperCase(),
        input.toCurrency.toUpperCase(),
        input.fromCountry.toUpperCase()
      );
    }),

  listPaymentRails: publicProcedure
    .input(z.object({ countryCode: z.string().optional() }))
    .query(({ input }) => {
      if (!input.countryCode) return Object.values(PAYMENT_RAILS);
      const country = COUNTRIES[input.countryCode.toUpperCase()];
      if (!country) return [];
      return Object.values(PAYMENT_RAILS).filter(rail =>
        rail.supportedCountries.includes(input.countryCode!.toUpperCase())
      );
    }),

  // ── TAX CALCULATION ────────────────────────────────────────────────────────
  calculateTax: publicProcedure
    .input(z.object({
      amount: z.number().positive(),
      countryCode: z.string().default("NG"),
      merchantType: z.string().default("general"),
      isTourist: z.boolean().default(false),
    }))
    .query(({ input }) => {
      return calculateTax(
        input.amount,
        input.countryCode.toUpperCase(),
        input.merchantType,
        input.isTourist
      );
    }),

  // ── DIASPORA CORRIDORS ─────────────────────────────────────────────────────
  getDiasporaCorridors: publicProcedure
    .input(z.object({ fromCountry: z.string().optional() }))
    .query(({ input }) => {
      if (!input.fromCountry) return DIASPORA_CORRIDORS;
      return DIASPORA_CORRIDORS.filter(c =>
        c.from === input.fromCountry!.toUpperCase()
      );
    }),

  // ── KYB DOCUMENTS ──────────────────────────────────────────────────────────
  getKybDocuments: publicProcedure
    .input(z.object({ countryCode: z.string().default("NG") }))
    .query(({ input }) => getKybDocuments(input.countryCode.toUpperCase())),

  // ── SETTLEMENT DAYS ────────────────────────────────────────────────────────
  getSettlementDays: publicProcedure
    .input(z.object({
      countryCode: z.string().default("NG"),
      merchantType: z.string().default("general"),
    }))
    .query(({ input }) => getSettlementDays(input.countryCode.toUpperCase(), input.merchantType)),

  // ── AIRPORTS ───────────────────────────────────────────────────────────────
  getAirports: publicProcedure
    .input(z.object({
      countryCode: z.string().optional(),
      internationalOnly: z.boolean().default(true),
    }))
    .query(({ input }) => {
      if (input.countryCode) {
        const country = COUNTRIES[input.countryCode.toUpperCase()];
        if (!country) return [];
        return input.internationalOnly
          ? country.airports.filter(a => a.isInternational)
          : country.airports;
      }
      return Object.values(COUNTRIES).flatMap(c =>
        input.internationalOnly ? c.airports.filter(a => a.isInternational) : c.airports
      );
    }),

  // ── PLATFORM SUMMARY ───────────────────────────────────────────────────────
  getPlatformCoverage: publicProcedure.query(() => ({
    totalCountries: SUPPORTED_COUNTRIES.length,
    destinationHubs: DESTINATION_HUBS.length,
    africanCountries: AFRICAN_COUNTRIES.length,
    totalCurrencies: SUPPORTED_CURRENCIES.length,
    fiatCurrencies: FIAT_CURRENCIES.length,
    stablecoins: STABLECOINS.length,
    paymentRails: Object.keys(PAYMENT_RAILS).length,
    diasporaCorridors: DIASPORA_CORRIDORS.length,
    touristCities: Object.values(CITIES).filter(c => c.isTouristHub).length,
    regions: [...new Set(Object.values(COUNTRIES).map(c => c.region))],
  })),
});
