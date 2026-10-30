import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";
export const flows = sqliteTable("flows", {
  id: text("id").primaryKey(), createdAt: integer("created_at").notNull(), expiresAt: integer("expires_at").notNull(),
  plan: text("plan"),
  ownerId: text("owner_id"),
});
export const steps = sqliteTable("steps", {
  id: text("id").primaryKey(), flowId: text("flow_id").notNull().references(() => flows.id),
  number: integer("number").notNull(), openedAt: integer("opened_at"), returnedAt: integer("returned_at"), linkHash: text("link_hash").notNull(),
}, table => [index("steps_flow_id_idx").on(table.flowId)]);
export const keys = sqliteTable("access_keys", {
  id: text("id").primaryKey(), flowId: text("flow_id").unique(), keyHash: text("key_hash").notNull().unique(),
  ownerId: text("owner_id"),
  label: text("label").notNull(), source: text("source").notNull(),
  createdAt: integer("created_at").notNull(), expiresAt: integer("expires_at"), revokedAt: integer("revoked_at"),
  durationKind: text("duration_kind").notNull(), durationAmount: integer("duration_amount").notNull(),
}, table => [index("access_keys_created_at_idx").on(table.createdAt), index("access_keys_owner_expiry_idx").on(table.ownerId, table.expiresAt)]);
export const limits = sqliteTable("rate_limits", {
  id: text("id").primaryKey(), hits: integer("hits").notNull(), expiresAt: integer("expires_at").notNull(),
}, table => [index("rate_limits_expires_at_idx").on(table.expiresAt)]);
export const keyDevices = sqliteTable("key_devices", {
  keyId: text("key_id").primaryKey().references(() => keys.id),
  hwidHash: text("hwid_hash").notNull(),
  boundAt: integer("bound_at").notNull(),
});
export const flowVerifications = sqliteTable("flow_verifications", {
  flowId: text("flow_id").primaryKey().references(() => flows.id),
  verifiedAt: integer("verified_at").notNull(),
});
export const siteSettings = sqliteTable("site_settings", {
  id: text("id").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at").notNull(),
});
export const supportThreads = sqliteTable("support_threads", {
  id: text("id").primaryKey(), ownerId: text("owner_id").notNull().unique(), ownerName: text("owner_name").notNull(),
  updatedAt: integer("updated_at").notNull(), preview: text("preview").notNull().default(""),
  lastMessageId: integer("last_message_id").notNull().default(0), lastUserId: integer("last_user_id").notNull().default(0),
  lastAdminId: integer("last_admin_id").notNull().default(0), adminReadId: integer("admin_read_id").notNull().default(0),
  userReadId: integer("user_read_id").notNull().default(0),
}, table => [index("support_threads_last_message_idx").on(table.lastMessageId)]);
export const supportMessages = sqliteTable("support_messages", {
  id: integer("id").primaryKey({ autoIncrement: true }), threadId: text("thread_id").notNull().references(() => supportThreads.id),
  clientId: text("client_id").notNull(), authorId: text("author_id").notNull(), role: text("role").notNull(),
  text: text("text").notNull(), imageKey: text("image_key"), imageType: text("image_type"), imageBytes: integer("image_bytes"),
  createdAt: integer("created_at").notNull(),
}, table => [index("support_messages_thread_idx").on(table.threadId, table.id),
  uniqueIndex("support_messages_retry_idx").on(table.threadId, table.authorId, table.clientId)]);
