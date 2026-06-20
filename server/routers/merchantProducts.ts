import { z } from "zod";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { getDb, createUserNotification } from "../db";
import { merchantProducts, establishments, serviceAvailability } from "../../drizzle/schema";
import { eq, and, desc, asc, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { storagePut } from "../storage";

const LOW_STOCK_THRESHOLD = 5;

// Helper: verify the merchant owns the establishment
async function assertOwnership(userId: number, establishmentId: number) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  const [est] = await db
    .select({ id: establishments.id })
    .from(establishments)
    .where(and(eq(establishments.id, establishmentId), eq(establishments.ownerId, userId)))
    .limit(1);
  if (!est) {
    throw new TRPCError({ code: "FORBIDDEN", message: "You do not own this establishment" });
  }
}

export const merchantProductsRouter = router({
  // List all products for a merchant's establishment
  list: protectedProcedure
    .input(z.object({ establishmentId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      await assertOwnership(ctx.user.id, input.establishmentId);
      const db = await getDb();
      if (!db) return [];
      return db
        .select()
        .from(merchantProducts)
        .where(eq(merchantProducts.establishmentId, input.establishmentId))
        .orderBy(asc(merchantProducts.sortOrder), desc(merchantProducts.createdAt));
    }),

  // Create a new product
  create: protectedProcedure
    .input(
      z.object({
        establishmentId: z.number().int().positive(),
        name: z.string().min(1).max(255),
        description: z.string().optional(),
        category: z.string().min(1).max(100).default("general"),
        price: z.string().regex(/^\d+(\.\d{1,2})?$/, "Invalid price format"),
        currency: z.string().length(3).default("USD"),
        imageUrl: z.string().url().optional(),
        sku: z.string().max(100).optional(),
        available: z.boolean().default(true),
        featured: z.boolean().default(false),
        sortOrder: z.number().int().default(0),
        quantity: z.number().int().min(0).nullable().optional(),
        lowStockThreshold: z.number().int().min(0).nullable().optional(),
        metadata: z.record(z.string(), z.unknown()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertOwnership(ctx.user.id, input.establishmentId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const [product] = await db
        .insert(merchantProducts)
        .values({
          establishmentId: input.establishmentId,
          name: input.name,
          description: input.description,
          category: input.category,
          price: input.price,
          currency: input.currency,
          imageUrl: input.imageUrl,
          sku: input.sku,
          available: input.available,
          featured: input.featured,
          sortOrder: input.sortOrder,
          metadata: {
            ...(input.metadata ?? {}),
            quantity: input.quantity ?? null,
            lowStockThreshold: input.lowStockThreshold ?? LOW_STOCK_THRESHOLD,
          },
        })
        .returning();
      return product;
    }),

  // Update a product
  update: protectedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        establishmentId: z.number().int().positive(),
        name: z.string().min(1).max(255).optional(),
        description: z.string().optional(),
        category: z.string().min(1).max(100).optional(),
        price: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
        currency: z.string().length(3).optional(),
        imageUrl: z.string().url().optional().nullable(),
        sku: z.string().max(100).optional().nullable(),
        available: z.boolean().optional(),
        featured: z.boolean().optional(),
        sortOrder: z.number().int().optional(),
        quantity: z.number().int().min(0).nullable().optional(),
        lowStockThreshold: z.number().int().min(0).nullable().optional(),
        metadata: z.record(z.string(), z.unknown()).optional().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertOwnership(ctx.user.id, input.establishmentId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const { id, establishmentId, quantity, lowStockThreshold, ...updates } = input;
      // Merge quantity into metadata
      if (quantity !== undefined || lowStockThreshold !== undefined) {
        const [current] = await db.select({ metadata: merchantProducts.metadata }).from(merchantProducts).where(eq(merchantProducts.id, id)).limit(1);
        const existingMeta = (current?.metadata as Record<string, unknown>) ?? {};
        (updates as any).metadata = {
          ...existingMeta,
          ...(quantity !== undefined ? { quantity } : {}),
          ...(lowStockThreshold !== undefined ? { lowStockThreshold } : {}),
        };
      }
      const [updated] = await db
        .update(merchantProducts)
        .set({ ...updates, updatedAt: new Date() })
        .where(
          and(
            eq(merchantProducts.id, id),
            eq(merchantProducts.establishmentId, establishmentId)
          )
        )
        .returning();
      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Product not found" });
      // Low stock alert
      const meta = (updated.metadata as Record<string, unknown>) ?? {};
      const qty = typeof meta.quantity === "number" ? meta.quantity : null;
      const threshold = typeof meta.lowStockThreshold === "number" ? meta.lowStockThreshold : LOW_STOCK_THRESHOLD;
      if (qty !== null && qty <= threshold && qty > 0) {
        createUserNotification({
          userId: ctx.user.id,
          category: "system",
          title: `Low Stock Alert: ${updated.name}`,
          content: `Product "${updated.name}" has only ${qty} units remaining (threshold: ${threshold}).`,
          actionUrl: `/merchant/products`,
          actionLabel: "Manage Products",
        }).catch(() => {});
      }
      return updated;
    }),

  // Toggle availability
  toggleAvailability: protectedProcedure
    .input(z.object({ id: z.number().int().positive(), establishmentId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await assertOwnership(ctx.user.id, input.establishmentId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const [current] = await db
        .select({ available: merchantProducts.available })
        .from(merchantProducts)
        .where(eq(merchantProducts.id, input.id))
        .limit(1);
      if (!current) throw new TRPCError({ code: "NOT_FOUND" });
      const [updated] = await db
        .update(merchantProducts)
        .set({ available: !current.available, updatedAt: new Date() })
        .where(eq(merchantProducts.id, input.id))
        .returning();
      return updated;
    }),

  // Delete a product
  delete: protectedProcedure
    .input(z.object({ id: z.number().int().positive(), establishmentId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await assertOwnership(ctx.user.id, input.establishmentId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      await db
        .delete(merchantProducts)
        .where(
          and(
            eq(merchantProducts.id, input.id),
            eq(merchantProducts.establishmentId, input.establishmentId)
          )
        );
      return { success: true };
    }),

  // Upload a product image to S3 and return the CDN URL
  uploadImage: protectedProcedure
    .input(
      z.object({
        establishmentId: z.number().int().positive(),
        /** Base64-encoded image data (without the data:image/... prefix) */
        base64Data: z.string().min(1),
        /** MIME type, e.g. image/jpeg, image/png, image/webp */
        mimeType: z.enum(["image/jpeg", "image/png", "image/webp", "image/gif"]),
        /** Original filename for extension detection */
        filename: z.string().max(255).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertOwnership(ctx.user.id, input.establishmentId);

      // Validate size: base64 is ~4/3 of binary, so 4 MB base64 ≈ 3 MB binary
      const MAX_BASE64_LEN = 4 * 1024 * 1024; // 4 MB base64 string
      if (input.base64Data.length > MAX_BASE64_LEN) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Image too large (max 3 MB)" });
      }

      const ext = input.mimeType.split("/")[1] ?? "jpg";
      const suffix = crypto.randomUUID().replace(/-/g, "").substring(0, 8);
      const fileKey = `merchant-products/${input.establishmentId}/${Date.now()}-${suffix}.${ext}`;

      const buffer = Buffer.from(input.base64Data, "base64");
      const { url } = await storagePut(fileKey, buffer, input.mimeType);

      return { url, fileKey };
    }),

  /**
   * Public: list available products for a tourist scanning a QR code.
   * Only returns products with available=true.
   * Optionally accepts a date (YYYY-MM-DD) to join slot availability.
   */
  listForTourist: publicProcedure
    .input(z.object({
      establishmentId: z.number().int().positive(),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), // YYYY-MM-DD
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const products = await db
        .select({
          id: merchantProducts.id,
          name: merchantProducts.name,
          description: merchantProducts.description,
          category: merchantProducts.category,
          price: merchantProducts.price,
          currency: merchantProducts.currency,
          imageUrl: merchantProducts.imageUrl,
          sku: merchantProducts.sku,
          featured: merchantProducts.featured,
          sortOrder: merchantProducts.sortOrder,
          metadata: merchantProducts.metadata,
        })
        .from(merchantProducts)
        .where(
          and(
            eq(merchantProducts.establishmentId, input.establishmentId),
            eq(merchantProducts.available, true)
          )
        )
        .orderBy(asc(merchantProducts.sortOrder), desc(merchantProducts.createdAt));

      // If a date is provided, enrich each product with slot availability
      if (input.date && products.length) {
        const productIds = products.map((p) => p.id);
        const availRows = await db
          .select({
            productId: serviceAvailability.productId,
            totalSlots: serviceAvailability.totalSlots,
            bookedSlots: serviceAvailability.bookedSlots,
            isBlocked: serviceAvailability.isBlocked,
          })
          .from(serviceAvailability)
          .where(
            and(
              sql`${serviceAvailability.productId} IN (${sql.join(productIds.map((id) => sql`${id}`), sql`, `)})`,
              eq(serviceAvailability.date, input.date)
            )
          );
        const availMap = new Map(availRows.map((r) => [r.productId, r]));
        return products.map((p) => {
          const avail = availMap.get(p.id);
          return {
            ...p,
            availability: avail
              ? {
                  date: input.date!,
                  totalSlots: avail.totalSlots ?? 0,
                  bookedSlots: avail.bookedSlots ?? 0,
                  availableSlots: Math.max(0, (avail.totalSlots ?? 0) - (avail.bookedSlots ?? 0)),
                  isBlocked: avail.isBlocked ?? false,
                  isAvailable: !(avail.isBlocked ?? false) && (avail.totalSlots ?? 0) > (avail.bookedSlots ?? 0),
                }
              : null, // null means no availability record set for this date
          };
        });
      }

      return products.map((p) => ({ ...p, availability: null }));
    }),

  // Get categories summary
  categories: protectedProcedure
    .input(z.object({ establishmentId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      await assertOwnership(ctx.user.id, input.establishmentId);
      const db = await getDb();
      if (!db) return [];
      const products = await db
        .select({ category: merchantProducts.category })
        .from(merchantProducts)
        .where(eq(merchantProducts.establishmentId, input.establishmentId));
      const counts: Record<string, number> = {};
      for (const p of products) {
        counts[p.category] = (counts[p.category] ?? 0) + 1;
      }
      return Object.entries(counts).map(([category, count]) => ({ category, count }));
    }),

  // ─── Gap 4: Bulk CSV Import ─────────────────────────────────────────────────
  bulkImport: protectedProcedure
    .input(
      z.object({
        establishmentId: z.number().int().positive(),
        /** CSV content: name,description,category,price,currency,sku,available */
        csvContent: z.string().min(10).max(500_000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertOwnership(ctx.user.id, input.establishmentId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const lines = input.csvContent.trim().split("\n");
      if (lines.length < 2) throw new TRPCError({ code: "BAD_REQUEST", message: "CSV must have header + at least 1 data row" });
      if (lines.length > 1001) throw new TRPCError({ code: "BAD_REQUEST", message: "Maximum 1000 products per import" });

      // Parse header
      const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
      const nameIdx = header.indexOf("name");
      const descIdx = header.indexOf("description");
      const catIdx = header.indexOf("category");
      const priceIdx = header.indexOf("price");
      const currIdx = header.indexOf("currency");
      const skuIdx = header.indexOf("sku");
      const availIdx = header.indexOf("available");

      if (nameIdx === -1 || priceIdx === -1) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "CSV must include 'name' and 'price' columns" });
      }

      const products: Array<{
        establishmentId: number;
        name: string;
        description: string | null;
        category: string;
        price: string;
        currency: string;
        sku: string | null;
        available: boolean;
        sortOrder: number;
      }> = [];
      const errors: string[] = [];

      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(",").map((c) => c.trim());
        const name = cols[nameIdx] ?? "";
        const price = cols[priceIdx] ?? "0";

        if (!name || name.length < 1) { errors.push(`Row ${i}: missing name`); continue; }
        if (!/^\d+(\.\d{1,2})?$/.test(price)) { errors.push(`Row ${i}: invalid price "${price}"`); continue; }

        products.push({
          establishmentId: input.establishmentId,
          name,
          description: descIdx >= 0 ? (cols[descIdx] || null) : null,
          category: catIdx >= 0 ? (cols[catIdx] || "general") : "general",
          price,
          currency: currIdx >= 0 ? (cols[currIdx] || "USD").toUpperCase().slice(0, 3) : "USD",
          sku: skuIdx >= 0 ? (cols[skuIdx] || null) : null,
          available: availIdx >= 0 ? cols[availIdx]?.toLowerCase() !== "false" : true,
          sortOrder: i,
        });
      }

      if (products.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `No valid products found. Errors: ${errors.join("; ")}` });
      }

      // Batch insert (chunks of 100)
      let inserted = 0;
      for (let i = 0; i < products.length; i += 100) {
        const chunk = products.slice(i, i + 100);
        const result = await db.insert(merchantProducts).values(chunk).returning({ id: merchantProducts.id });
        inserted += result.length;
      }

      return { imported: inserted, errors, total: lines.length - 1 };
    }),

  // ─── Gap 5: Product Variants/Options ─────────────────────────────────────────
  addVariant: protectedProcedure
    .input(
      z.object({
        productId: z.number().int().positive(),
        establishmentId: z.number().int().positive(),
        variants: z.array(
          z.object({
            name: z.string().min(1).max(100),
            options: z.array(
              z.object({
                label: z.string().min(1).max(50),
                priceAdjustment: z.number().default(0),
              })
            ).min(1).max(20),
          })
        ).min(1).max(5),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertOwnership(ctx.user.id, input.establishmentId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      // Store variants in the metadata JSONB column
      const [product] = await db
        .select({ metadata: merchantProducts.metadata })
        .from(merchantProducts)
        .where(
          and(
            eq(merchantProducts.id, input.productId),
            eq(merchantProducts.establishmentId, input.establishmentId)
          )
        )
        .limit(1);

      if (!product) throw new TRPCError({ code: "NOT_FOUND", message: "Product not found" });

      const existingMeta = (product.metadata as Record<string, unknown>) ?? {};
      const updatedMeta = { ...existingMeta, variants: input.variants };

      const [updated] = await db
        .update(merchantProducts)
        .set({ metadata: updatedMeta, updatedAt: new Date() })
        .where(eq(merchantProducts.id, input.productId))
        .returning();

      return updated;
    }),

  getVariants: protectedProcedure
    .input(z.object({ productId: z.number().int().positive(), establishmentId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      await assertOwnership(ctx.user.id, input.establishmentId);
      const db = await getDb();
      if (!db) return [];
      const [product] = await db
        .select({ metadata: merchantProducts.metadata })
        .from(merchantProducts)
        .where(
          and(eq(merchantProducts.id, input.productId), eq(merchantProducts.establishmentId, input.establishmentId))
        )
        .limit(1);
      if (!product) return [];
      const meta = product.metadata as Record<string, unknown> | null;
      return (meta?.variants as unknown[]) ?? [];
    }),

  // ─── Gap 7: Price Change Audit Trail ─────────────────────────────────────────
  updateWithAudit: protectedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        establishmentId: z.number().int().positive(),
        price: z.string().regex(/^\d+(\.\d{1,2})?$/, "Invalid price format"),
        currency: z.string().length(3).optional(),
        reason: z.string().max(500).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertOwnership(ctx.user.id, input.establishmentId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      // Get current price before update
      const [current] = await db
        .select({ price: merchantProducts.price, currency: merchantProducts.currency, name: merchantProducts.name })
        .from(merchantProducts)
        .where(and(eq(merchantProducts.id, input.id), eq(merchantProducts.establishmentId, input.establishmentId)))
        .limit(1);
      if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Product not found" });

      const updates: Record<string, unknown> = { price: input.price, updatedAt: new Date() };
      if (input.currency) updates.currency = input.currency;

      // Update price
      const [updated] = await db
        .update(merchantProducts)
        .set(updates)
        .where(eq(merchantProducts.id, input.id))
        .returning();

      // Store audit in metadata.priceHistory
      const meta = (updated.metadata as Record<string, unknown>) ?? {};
      const history: unknown[] = (meta.priceHistory as unknown[]) ?? [];
      history.push({
        previousPrice: current.price,
        previousCurrency: current.currency,
        newPrice: input.price,
        newCurrency: input.currency ?? current.currency,
        changedBy: ctx.user.id,
        changedAt: new Date().toISOString(),
        reason: input.reason ?? null,
      });
      // Keep last 50 entries
      const trimmed = history.slice(-50);
      await db
        .update(merchantProducts)
        .set({ metadata: { ...meta, priceHistory: trimmed } })
        .where(eq(merchantProducts.id, input.id));

      return {
        product: updated,
        priceChange: {
          from: `${current.price} ${current.currency}`,
          to: `${input.price} ${input.currency ?? current.currency}`,
        },
      };
    }),

  // Get price history for a product
  priceHistory: protectedProcedure
    .input(z.object({ productId: z.number().int().positive(), establishmentId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      await assertOwnership(ctx.user.id, input.establishmentId);
      const db = await getDb();
      if (!db) return [];
      const [product] = await db
        .select({ metadata: merchantProducts.metadata })
        .from(merchantProducts)
        .where(and(eq(merchantProducts.id, input.productId), eq(merchantProducts.establishmentId, input.establishmentId)))
        .limit(1);
      if (!product) return [];
      const meta = product.metadata as Record<string, unknown> | null;
      return (meta?.priceHistory as unknown[]) ?? [];
    }),

  // Mobile-compatible aliases
  getProducts: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    const ests = await db.select({ id: establishments.id }).from(establishments).where(eq(establishments.ownerId, ctx.user.id));
    if (ests.length === 0) return [];
    return db
      .select()
      .from(merchantProducts)
      .where(eq(merchantProducts.establishmentId, ests[0].id))
      .orderBy(asc(merchantProducts.sortOrder), desc(merchantProducts.createdAt));
  }),

  createProduct: protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(255),
      description: z.string().optional(),
      category: z.string().min(1).max(100).default("general"),
      price: z.string().regex(/^\d+(\.\d{1,2})?$/, "Invalid price format"),
      currency: z.string().length(3).default("USD"),
      imageUrl: z.string().url().optional(),
      available: z.boolean().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const ests = await db.select({ id: establishments.id }).from(establishments).where(eq(establishments.ownerId, ctx.user.id));
      if (ests.length === 0) throw new TRPCError({ code: "FORBIDDEN", message: "No establishment found" });
      const [product] = await db.insert(merchantProducts).values({
        establishmentId: ests[0].id,
        name: input.name,
        description: input.description,
        category: input.category,
        price: input.price,
        currency: input.currency,
        imageUrl: input.imageUrl,
        available: input.available,
      }).returning();
      return product;
    }),

  updateProduct: protectedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().optional(),
      description: z.string().optional(),
      price: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
      available: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const { id, ...updates } = input;
      const [updated] = await db
        .update(merchantProducts)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(merchantProducts.id, id))
        .returning();
      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Product not found" });
      return updated;
    }),
});
