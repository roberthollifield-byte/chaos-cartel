// ============================================================
// Chaos Cartel — PostgreSQL schema (via Drizzle ORM)
// Timestamps are stored as bigint unix seconds (integer) for
// consistent client-side handling. This schema is used in
// production on Railway/Postgres.
// ============================================================
import { pgTable, serial, text, integer, bigint, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ============ ADMIN USERS ============
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  isAdmin: boolean("is_admin").notNull().default(false),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// ============ EVENTS / SESSIONS ============
export const events = pgTable("events", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  subtitle: text("subtitle"),
  description: text("description").notNull().default(""),
  location: text("location").notNull().default("Forest City, NC"),
  venue: text("venue"),
  startsAt: bigint("starts_at", { mode: "number" }).notNull(), // unix seconds
  endsAt: bigint("ends_at", { mode: "number" }).notNull(),
  driverPriceCents: integer("driver_price_cents").notNull().default(11000),
  driverSlots: integer("driver_slots").notNull().default(20),
  rideAlongPriceCents: integer("ride_along_price_cents").notNull().default(2500),
  rideAlongSlots: integer("ride_along_slots").notNull().default(40),
  spectatorPriceCents: integer("spectator_price_cents").notNull().default(1000),
  spectatorSlots: integer("spectator_slots").notNull().default(200),
  status: text("status").notNull().default("published"), // draft | published | sold_out | closed
  heroImageUrl: text("hero_image_url"),
  inviteCode: text("invite_code"), // null = open registration; set = invite-only
  createdAt: bigint("created_at", { mode: "number" }).notNull().default(0),
});

export const insertEventSchema = createInsertSchema(events).omit({
  id: true,
  createdAt: true,
}).extend({
  startsAt: z.number().int(),
  endsAt: z.number().int(),
});
export type InsertEvent = z.infer<typeof insertEventSchema>;
export type Event = typeof events.$inferSelect;

// ============ REGISTRATIONS ============
export const registrations = pgTable("registrations", {
  id: serial("id").primaryKey(),
  eventId: integer("event_id").notNull(),
  ticketType: text("ticket_type").notNull(), // driver | ride_along | spectator
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  emergencyContactName: text("emergency_contact_name"),
  emergencyContactPhone: text("emergency_contact_phone"),
  // Driver-only fields
  carYear: text("car_year"),
  carMake: text("car_make"),
  carModel: text("car_model"),
  carColor: text("car_color"),
  techInspection: text("tech_inspection"), // JSON: {tires, brakes, seatbelt, battery, fluids, roll_cage_or_bar, helmet}
  experienceLevel: text("experience_level"), // beginner | intermediate | advanced
  // Waivers
  waiverSigned: boolean("waiver_signed").notNull().default(false),
  waiverSignedAt: bigint("waiver_signed_at", { mode: "number" }),
  waiverSignatureName: text("waiver_signature_name"),
  // Payment
  stripeSessionId: text("stripe_session_id"),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  amountPaidCents: integer("amount_paid_cents").notNull().default(0),
  paymentStatus: text("payment_status").notNull().default("pending"), // pending | paid | refunded | failed | preview
  // Check-in / ticketing
  confirmationCode: text("confirmation_code").unique(), // e.g. CC-A7K9-2Q4M — used as QR payload
  checkedInAt: bigint("checked_in_at", { mode: "number" }), // null = not checked in
  checkedInBy: text("checked_in_by"), // admin username who scanned
  createdAt: bigint("created_at", { mode: "number" }).notNull().default(0),
});

export const insertRegistrationSchema = createInsertSchema(registrations).omit({
  id: true,
  createdAt: true,
  stripeSessionId: true,
  stripePaymentIntentId: true,
  amountPaidCents: true,
  paymentStatus: true,
});
export type InsertRegistration = z.infer<typeof insertRegistrationSchema>;
export type Registration = typeof registrations.$inferSelect;

// Booking payload sent from the client to start checkout
export const bookingPayloadSchema = z.object({
  eventId: z.number().int().positive(),
  ticketType: z.enum(["driver", "ride_along", "spectator"]),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().min(7),
  emergencyContactName: z.string().optional(),
  emergencyContactPhone: z.string().optional(),
  // Driver-only
  carYear: z.string().optional(),
  carMake: z.string().optional(),
  carModel: z.string().optional(),
  carColor: z.string().optional(),
  techInspection: z.object({
    tires: z.boolean(),
    brakes: z.boolean(),
    seatbelt: z.boolean(),
    battery: z.boolean(),
    fluids: z.boolean(),
    rollCageOrBar: z.boolean(),
    helmet: z.boolean(),
  }).optional(),
  experienceLevel: z.enum(["beginner", "intermediate", "advanced"]).optional(),
  waiverSignatureName: z.string().min(1),
  waiverAgreed: z.literal(true),
  inviteCode: z.string().optional(),
});
export type BookingPayload = z.infer<typeof bookingPayloadSchema>;

// ============ MERCHANDISE ============
export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  priceCents: integer("price_cents").notNull(),
  imageUrl: text("image_url"),
  category: text("category").notNull().default("apparel"), // apparel | stickers | accessories
  sizes: text("sizes"), // JSON string array
  inStock: boolean("in_stock").notNull().default(true),
  createdAt: bigint("created_at", { mode: "number" }).notNull().default(0),
});

export const insertProductSchema = createInsertSchema(products).omit({
  id: true,
  createdAt: true,
});
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof products.$inferSelect;

// ============ MERCH ORDERS ============
// Historical single-item orders kept product_id + size on the parent row.
// Multi-item orders (cart-based) use the order_items child table below.
// For those, product_id/size on the parent are null and item detail lives in order_items.
export const orders = pgTable("orders", {
  id: serial("id").primaryKey(),
  productId: integer("product_id"),
  size: text("size"),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  shippingAddress: text("shipping_address").notNull(),
  shippingCity: text("shipping_city").notNull(),
  shippingState: text("shipping_state").notNull(),
  shippingZip: text("shipping_zip").notNull(),
  stripeSessionId: text("stripe_session_id"),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  amountPaidCents: integer("amount_paid_cents").notNull().default(0),
  subtotalCents: integer("subtotal_cents").notNull().default(0),
  shippingCents: integer("shipping_cents").notNull().default(0),
  itemCount: integer("item_count").notNull().default(1),
  paymentStatus: text("payment_status").notNull().default("pending"),
  createdAt: bigint("created_at", { mode: "number" }).notNull().default(0),
});

// Per-size stock tracking. One row per (product, size). Products without sizes
// get a single variant with size=null. Set unlimitedStock=true for print-on-demand
// items like stickers/decals where we never want to block a sale.
export const productVariants = pgTable("product_variants", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull(),
  size: text("size"),
  quantity: integer("quantity").notNull().default(0),
  unlimitedStock: boolean("unlimited_stock").notNull().default(false),
});
export type ProductVariant = typeof productVariants.$inferSelect;
export type InsertProductVariant = typeof productVariants.$inferInsert;

export const orderItems = pgTable("order_items", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull(),
  productId: integer("product_id").notNull(),
  productName: text("product_name").notNull(),
  productSlug: text("product_slug").notNull(),
  size: text("size"),
  quantity: integer("quantity").notNull().default(1),
  unitPriceCents: integer("unit_price_cents").notNull(),
  category: text("category").notNull().default("apparel"),
});

// Legacy single-item payload (still supported for backward compatibility).
export const merchOrderPayloadSchema = z.object({
  productId: z.number().int().positive(),
  size: z.string().optional(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  shippingAddress: z.string().min(3),
  shippingCity: z.string().min(1),
  shippingState: z.string().min(2),
  shippingZip: z.string().min(3),
});
export type MerchOrderPayload = z.infer<typeof merchOrderPayloadSchema>;

// New multi-item cart checkout payload.
export const cartCheckoutPayloadSchema = z.object({
  items: z.array(z.object({
    productId: z.number().int().positive(),
    size: z.string().optional().nullable(),
    quantity: z.number().int().positive().max(20),
  })).min(1).max(30),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  shippingAddress: z.string().min(3),
  shippingCity: z.string().min(1),
  shippingState: z.string().min(2),
  shippingZip: z.string().min(3),
});
export type CartCheckoutPayload = z.infer<typeof cartCheckoutPayloadSchema>;
export type Order = typeof orders.$inferSelect;
export type OrderItem = typeof orderItems.$inferSelect;
export type InsertOrderItem = typeof orderItems.$inferInsert;

// ============ CREW ============
export const crewMembers = pgTable("crew_members", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  role: text("role").notNull(),
  car: text("car"),
  bio: text("bio").notNull().default(""),
  imageUrl: text("image_url"),
  instagram: text("instagram"),
  displayOrder: integer("display_order").notNull().default(0),
});

export const insertCrewSchema = createInsertSchema(crewMembers).omit({ id: true });
export type InsertCrew = z.infer<typeof insertCrewSchema>;
export type CrewMember = typeof crewMembers.$inferSelect;

// ============ EVENT AVAILABILITY (computed) ============
export type EventAvailability = Event & {
  driverBooked: number;
  rideAlongBooked: number;
  spectatorBooked: number;
  driverRemaining: number;
  rideAlongRemaining: number;
  spectatorRemaining: number;
};
