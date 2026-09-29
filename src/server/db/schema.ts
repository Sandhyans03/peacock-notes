import { pgTable, pgEnum, uuid, text, timestamp, integer, index } from "drizzle-orm/pg-core";

export const shareTypeEnum = pgEnum("share_type", ["one_time", "time_based"]);
export const accessTypeEnum = pgEnum("access_type", ["public", "password"]);

export const notes = pgTable("notes", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const shareLinks = pgTable(
  "share_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    noteId: uuid("note_id").notNull().references(() => notes.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    shareType: shareTypeEnum("share_type").notNull(),
    accessType: accessTypeEnum("access_type").notNull(),
    passwordHash: text("password_hash"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    viewCount: integer("view_count").notNull().default(0),
    failedAttempts: integer("failed_attempts").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("share_links_note_idx").on(t.noteId)]
);
export * from "./auth-schema";
