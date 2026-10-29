import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const specforgeAnalysesTable = pgTable("specforge_analyses", {
  id: text("id").primaryKey(),
  data: jsonb("data").$type<unknown>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type SpecforgeAnalysisRow = typeof specforgeAnalysesTable.$inferSelect;
