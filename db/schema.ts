import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
export const flows = sqliteTable("flows", {
  id: text("id").primaryKey(), createdAt: integer("created_at").notNull(), expiresAt: integer("expires_at").notNull(),
});
export const steps = sqliteTable("steps", {
  id: text("id").primaryKey(), flowId: text("flow_id").notNull().references(() => flows.id),
  number: integer("number").notNull(), openedAt: integer("opened_at"), returnedAt: integer("returned_at"), linkHash: text("link_hash").notNull(),
});
export const keys = sqliteTable("access_keys", {
  id: text("id").primaryKey(), flowId: text("flow_id").unique(), keyHash: text("key_hash").notNull().unique(),
  label: text("label").notNull(), source: text("source").notNull(),
  createdAt: integer("created_at").notNull(), expiresAt: integer("expires_at"), revokedAt: integer("revoked_at"),
  durationKind: text("duration_kind").notNull(), durationAmount: integer("duration_amount").notNull(),
});
export const limits = sqliteTable("rate_limits", {
  id: text("id").primaryKey(), hits: integer("hits").notNull(), expiresAt: integer("expires_at").notNull(),
});
