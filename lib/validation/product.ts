import { z } from "zod";

export const productFilterSchema = z.object({
  q: z.string().trim().max(120).optional(),
  category: z.string().trim().max(140).optional(),
  brand: z.array(z.string().trim().max(140)).default([]),
  supplier: z.array(z.string().trim().max(140)).default([]),
  minPrice: z.coerce.number().nonnegative().optional(),
  maxPrice: z.coerce.number().positive().optional(),
  minRating: z.coerce.number().min(0).max(5).optional(),
  minDiscount: z.coerce.number().min(0).max(100).optional(),
  available: z.coerce.boolean().optional(),
  sort: z
    .enum(["relevance", "price-asc", "price-desc", "discount", "rating", "newest"])
    .default("relevance"),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(60).default(24),
});

export type ProductFilters = z.infer<typeof productFilterSchema>;
