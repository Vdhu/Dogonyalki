import {
  doublePrecision,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("tag_role", ["seeker", "runner"]);

export const tagSessions = pgTable("tag_sessions", {
  code: varchar("code", { length: 16 }).primaryKey(),
  creatorId: text("creator_id").notNull(),
  revealIntervalSeconds: integer("reveal_interval_seconds").notNull(),
  nextRevealAt: timestamp("next_reveal_at", {
    withTimezone: true,
    mode: "date",
  }).notNull(),
  createdAt: timestamp("created_at", {
    withTimezone: true,
    mode: "date",
  })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", {
    withTimezone: true,
    mode: "date",
  })
    .defaultNow()
    .notNull(),
});

export const tagPlayers = pgTable(
  "tag_players",
  {
    id: text("id").primaryKey(),
    sessionCode: varchar("session_code", { length: 16 })
      .notNull()
      .references(() => tagSessions.code, { onDelete: "cascade" }),
    nickname: text("nickname").notNull(),
    role: roleEnum("role").notNull(),
    color: varchar("color", { length: 16 }).notNull(),
    actualLat: doublePrecision("actual_lat"),
    actualLng: doublePrecision("actual_lng"),
    revealedLat: doublePrecision("revealed_lat"),
    revealedLng: doublePrecision("revealed_lng"),
    lastActualAt: timestamp("last_actual_at", {
      withTimezone: true,
      mode: "date",
    }),
    lastRevealedAt: timestamp("last_revealed_at", {
      withTimezone: true,
      mode: "date",
    }),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    sessionCodeIdx: index("tag_players_session_code_idx").on(table.sessionCode),
  })
);

export type Role = (typeof roleEnum.enumValues)[number];
