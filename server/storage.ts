// ============================================================
// Chaos Cartel — PostgreSQL storage layer (drizzle-orm + pg)
// Uses process.env.DATABASE_URL (auto-injected by Railway's
// Postgres plugin). Bootstraps schema on startup for zero-touch
// deploys.
// ============================================================
import {
  users, events, registrations, products, productVariants, orders, orderItems, crewMembers,
  type User, type InsertUser,
  type Event, type InsertEvent, type EventAvailability,
  type Registration, type InsertRegistration,
  type Product, type InsertProduct,
  type ProductVariant, type InsertProductVariant,
  type Order, type OrderItem, type InsertOrderItem,
  type CrewMember, type InsertCrew,
} from '@shared/schema';
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { eq, and, desc, sql } from "drizzle-orm";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not set. Provide a PostgreSQL connection string.\n" +
    "  • Railway: add the Postgres plugin — DATABASE_URL is auto-injected.\n" +
    "  • Local dev: run docker compose up -d and use the URL from .env.example."
  );
}

// SSL config: Railway managed Postgres uses valid certs, but some providers
// (including Railway's public proxy) require a permissive TLS handshake.
const needsSSL = /sslmode=require|railway|render|supabase|neon/.test(process.env.DATABASE_URL);
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: needsSSL ? { rejectUnauthorized: false } : undefined,
});

export const db = drizzle(pool);

// ============ SCHEMA BOOTSTRAP ============
// Idempotent CREATE TABLE IF NOT EXISTS so Railway boots clean without a
// separate migration step. For production migrations use `npm run db:push`.
export async function bootstrapSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      is_admin BOOLEAN NOT NULL DEFAULT false
    );
    CREATE TABLE IF NOT EXISTS events (
      id SERIAL PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      subtitle TEXT,
      description TEXT NOT NULL DEFAULT '',
      location TEXT NOT NULL DEFAULT 'Forest City, NC',
      venue TEXT,
      starts_at BIGINT NOT NULL,
      ends_at BIGINT NOT NULL,
      driver_price_cents INTEGER NOT NULL DEFAULT 11000,
      driver_slots INTEGER NOT NULL DEFAULT 20,
      ride_along_price_cents INTEGER NOT NULL DEFAULT 2500,
      ride_along_slots INTEGER NOT NULL DEFAULT 40,
      spectator_price_cents INTEGER NOT NULL DEFAULT 1000,
      spectator_slots INTEGER NOT NULL DEFAULT 200,
      status TEXT NOT NULL DEFAULT 'published',
      hero_image_url TEXT,
      invite_code TEXT,
      created_at BIGINT NOT NULL DEFAULT 0
    );
    -- Idempotent column add for pre-existing deploys
    ALTER TABLE events ADD COLUMN IF NOT EXISTS invite_code TEXT;
    CREATE TABLE IF NOT EXISTS registrations (
      id SERIAL PRIMARY KEY,
      event_id INTEGER NOT NULL,
      ticket_type TEXT NOT NULL,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT NOT NULL,
      emergency_contact_name TEXT,
      emergency_contact_phone TEXT,
      car_year TEXT,
      car_make TEXT,
      car_model TEXT,
      car_color TEXT,
      tech_inspection TEXT,
      experience_level TEXT,
      waiver_signed BOOLEAN NOT NULL DEFAULT false,
      waiver_signed_at BIGINT,
      waiver_signature_name TEXT,
      stripe_session_id TEXT,
      stripe_payment_intent_id TEXT,
      amount_paid_cents INTEGER NOT NULL DEFAULT 0,
      payment_status TEXT NOT NULL DEFAULT 'pending',
      created_at BIGINT NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_registrations_event ON registrations(event_id);
    CREATE INDEX IF NOT EXISTS idx_registrations_stripe ON registrations(stripe_session_id);
    -- Registration check-in columns (idempotent for existing DBs)
    ALTER TABLE registrations ADD COLUMN IF NOT EXISTS confirmation_code TEXT;
    ALTER TABLE registrations ADD COLUMN IF NOT EXISTS checked_in_at BIGINT;
    ALTER TABLE registrations ADD COLUMN IF NOT EXISTS checked_in_by TEXT;
    ALTER TABLE registrations ADD COLUMN IF NOT EXISTS crew_member_name TEXT;
    ALTER TABLE registrations ADD COLUMN IF NOT EXISTS extra_spectators INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE registrations ADD COLUMN IF NOT EXISTS extra_ride_alongs INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE registrations ADD COLUMN IF NOT EXISTS email_sent_at BIGINT;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_registrations_confirmation_code ON registrations (confirmation_code);
    CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      price_cents INTEGER NOT NULL,
      image_url TEXT,
      category TEXT NOT NULL DEFAULT 'apparel',
      sizes TEXT,
      in_stock BOOLEAN NOT NULL DEFAULT true,
      created_at BIGINT NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS orders (
      id SERIAL PRIMARY KEY,
      product_id INTEGER NOT NULL,
      size TEXT,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT,
      shipping_address TEXT NOT NULL,
      shipping_city TEXT NOT NULL,
      shipping_state TEXT NOT NULL,
      shipping_zip TEXT NOT NULL,
      stripe_session_id TEXT,
      stripe_payment_intent_id TEXT,
      amount_paid_cents INTEGER NOT NULL DEFAULT 0,
      payment_status TEXT NOT NULL DEFAULT 'pending',
      created_at BIGINT NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_orders_stripe ON orders(stripe_session_id);
    -- Multi-item cart support: relax legacy NOT NULL constraint on product_id
    -- and add subtotal/shipping/item_count columns.
    ALTER TABLE orders ALTER COLUMN product_id DROP NOT NULL;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS subtotal_cents INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_cents INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS item_count INTEGER NOT NULL DEFAULT 1;
    CREATE TABLE IF NOT EXISTS order_items (
      id SERIAL PRIMARY KEY,
      order_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      product_name TEXT NOT NULL,
      product_slug TEXT NOT NULL,
      size TEXT,
      quantity INTEGER NOT NULL DEFAULT 1,
      unit_price_cents INTEGER NOT NULL,
      category TEXT NOT NULL DEFAULT 'apparel'
    );
    CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
    -- Per-size stock. One row per (product, size). size IS NULL for one-size products.
    CREATE TABLE IF NOT EXISTS product_variants (
      id SERIAL PRIMARY KEY,
      product_id INTEGER NOT NULL,
      size TEXT,
      quantity INTEGER NOT NULL DEFAULT 0,
      unlimited_stock BOOLEAN NOT NULL DEFAULT false
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_variants_product_size
      ON product_variants(product_id, COALESCE(size, ''));
    CREATE INDEX IF NOT EXISTS idx_variants_product ON product_variants(product_id);
    CREATE TABLE IF NOT EXISTS crew_members (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      car TEXT,
      bio TEXT NOT NULL DEFAULT '',
      image_url TEXT,
      instagram TEXT,
      display_order INTEGER NOT NULL DEFAULT 0
    );
  `);
}

export interface IStorage {
  // Events
  listEvents(): Promise<EventAvailability[]>;
  getEventBySlug(slug: string): Promise<EventAvailability | undefined>;
  getEventById(id: number): Promise<EventAvailability | undefined>;
  createEvent(data: InsertEvent): Promise<Event>;
  updateEvent(id: number, data: Partial<InsertEvent>): Promise<Event | undefined>;
  deleteEvent(id: number): Promise<boolean>;

  // Registrations
  createRegistration(data: Partial<Registration>): Promise<Registration>;
  updateRegistrationBySession(sessionId: string, patch: Partial<Registration>): Promise<Registration | undefined>;
  updateRegistrationById(id: number, patch: Partial<Registration>): Promise<Registration | undefined>;
  listRegistrations(eventId?: number): Promise<Registration[]>;
  deleteRegistration(id: number): Promise<number>;
  deleteUnpaidRegistrations(eventId?: number): Promise<number>;
  getRegistrationById(id: number): Promise<Registration | undefined>;
  getRegistrationByConfirmationCode(code: string): Promise<Registration | undefined>;
  countBookedByType(eventId: number): Promise<{ driver: number; ride_along: number; spectator: number }>;

  // Products
  listProducts(): Promise<Product[]>;
  getProductBySlug(slug: string): Promise<Product | undefined>;
  getProductById(id: number): Promise<Product | undefined>;
  createProduct(data: InsertProduct): Promise<Product>;
  updateProduct(id: number, data: Partial<InsertProduct>): Promise<Product | undefined>;
  deleteProduct(id: number): Promise<boolean>;

  // Merch orders
  createOrder(data: Partial<Order>): Promise<Order>;
  getOrderById(id: number): Promise<Order | undefined>;
  createOrderItems(items: InsertOrderItem[]): Promise<OrderItem[]>;
  listOrderItems(orderId: number): Promise<OrderItem[]>;

  // Stock / variants
  listVariants(productId?: number): Promise<ProductVariant[]>;
  getVariant(productId: number, size: string | null): Promise<ProductVariant | undefined>;
  upsertVariant(data: InsertProductVariant): Promise<ProductVariant>;
  updateVariantQuantity(id: number, quantity: number, unlimitedStock?: boolean): Promise<ProductVariant | undefined>;
  // Atomic: succeeds only if variant has >= qty in stock (or unlimited). Returns true on success.
  reserveStock(productId: number, size: string | null, quantity: number): Promise<boolean>;
  releaseStock(productId: number, size: string | null, quantity: number): Promise<void>;
  updateOrderBySession(sessionId: string, patch: Partial<Order>): Promise<Order | undefined>;
  listOrders(): Promise<Order[]>;

  // Crew
  listCrew(): Promise<CrewMember[]>;
  createCrewMember(data: InsertCrew): Promise<CrewMember>;
  updateCrewMember(id: number, data: Partial<InsertCrew>): Promise<CrewMember | undefined>;
  deleteCrewMember(id: number): Promise<boolean>;

  // Auth
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser & { isAdmin?: boolean }): Promise<User>;
}

const first = <T>(rows: T[]): T | undefined => rows[0];

export class DatabaseStorage implements IStorage {
  private async attach(event: Event): Promise<EventAvailability> {
    const counts = await this.countBookedByType(event.id);
    return {
      ...event,
      driverBooked: counts.driver,
      rideAlongBooked: counts.ride_along,
      spectatorBooked: counts.spectator,
      driverRemaining: Math.max(0, event.driverSlots - counts.driver),
      rideAlongRemaining: Math.max(0, event.rideAlongSlots - counts.ride_along),
      spectatorRemaining: Math.max(0, event.spectatorSlots - counts.spectator),
    };
  }

  async listEvents(): Promise<EventAvailability[]> {
    const rows = await db.select().from(events).orderBy(events.startsAt);
    return Promise.all(rows.map(r => this.attach(r)));
  }
  async getEventBySlug(slug: string) {
    const row = first(await db.select().from(events).where(eq(events.slug, slug)));
    return row ? this.attach(row) : undefined;
  }
  async getEventById(id: number) {
    const row = first(await db.select().from(events).where(eq(events.id, id)));
    return row ? this.attach(row) : undefined;
  }
  async createEvent(data: InsertEvent): Promise<Event> {
    const rows = await db.insert(events).values({ ...data, createdAt: Math.floor(Date.now() / 1000) }).returning();
    return rows[0];
  }
  async updateEvent(id: number, data: Partial<InsertEvent>) {
    return first(await db.update(events).set(data).where(eq(events.id, id)).returning());
  }
  async deleteEvent(id: number): Promise<boolean> {
    const rows = await db.delete(events).where(eq(events.id, id)).returning({ id: events.id });
    return rows.length > 0;
  }

  async createRegistration(data: Partial<Registration>): Promise<Registration> {
    const rows = await db.insert(registrations).values({
      ...(data as any),
      createdAt: Math.floor(Date.now() / 1000),
    }).returning();
    return rows[0];
  }
  async updateRegistrationBySession(sessionId: string, patch: Partial<Registration>) {
    return first(await db.update(registrations).set(patch).where(eq(registrations.stripeSessionId, sessionId)).returning());
  }
  async updateRegistrationById(id: number, patch: Partial<Registration>) {
    return first(await db.update(registrations).set(patch).where(eq(registrations.id, id)).returning());
  }
  async getRegistrationByConfirmationCode(code: string) {
    return first(await db.select().from(registrations).where(eq(registrations.confirmationCode, code)));
  }
  async listRegistrations(eventId?: number) {
    if (eventId != null) {
      return db.select().from(registrations).where(eq(registrations.eventId, eventId)).orderBy(desc(registrations.createdAt));
    }
    return db.select().from(registrations).orderBy(desc(registrations.createdAt));
  }
  async deleteRegistration(id: number) {
    const rows = await db.delete(registrations).where(eq(registrations.id, id)).returning({ id: registrations.id });
    return rows.length;
  }
  async deleteUnpaidRegistrations(eventId?: number) {
    // Delete anything that never made it to 'paid' — pending, expired, failed, etc.
    const cond = eventId != null
      ? and(sql`${registrations.paymentStatus} <> 'paid'`, eq(registrations.eventId, eventId))
      : sql`${registrations.paymentStatus} <> 'paid'`;
    const rows = await db.delete(registrations).where(cond).returning({ id: registrations.id });
    return rows.length;
  }
  async getRegistrationById(id: number) {
    return first(await db.select().from(registrations).where(eq(registrations.id, id)));
  }
  async countBookedByType(eventId: number) {
    const rows = await db.select({
      ticketType: registrations.ticketType,
      c: sql<number>`count(*)::int`,
    })
    .from(registrations)
    .where(and(eq(registrations.eventId, eventId), eq(registrations.paymentStatus, 'paid')))
    .groupBy(registrations.ticketType) as { ticketType: string; c: number }[];
    const out = { driver: 0, ride_along: 0, spectator: 0 };
    for (const r of rows) {
      if (r.ticketType === 'driver') out.driver = Number(r.c);
      else if (r.ticketType === 'ride_along') out.ride_along = Number(r.c);
      else if (r.ticketType === 'spectator') out.spectator = Number(r.c);
    }
    // Paid driver crew add-ons occupy spectator / ride-along capacity.
    const extraRow = first(await db.select({
      spectators: sql<number>`coalesce(sum(extra_spectators),0)::int`,
      rideAlongs: sql<number>`coalesce(sum(extra_ride_alongs),0)::int`,
    })
    .from(registrations)
    .where(and(
      eq(registrations.eventId, eventId),
      eq(registrations.paymentStatus, 'paid'),
      eq(registrations.ticketType, 'driver'),
    ))) as { spectators: number; rideAlongs: number } | undefined;
    out.spectator += Number(extraRow?.spectators || 0);
    out.ride_along += Number(extraRow?.rideAlongs || 0);
    return out;
  }

  async listProducts() { return db.select().from(products); }
  async getProductBySlug(slug: string) { return first(await db.select().from(products).where(eq(products.slug, slug))); }
  async getProductById(id: number) { return first(await db.select().from(products).where(eq(products.id, id))); }
  async createProduct(data: InsertProduct) {
    const rows = await db.insert(products).values({ ...data, createdAt: Math.floor(Date.now() / 1000) }).returning();
    return rows[0];
  }
  async updateProduct(id: number, data: Partial<InsertProduct>) {
    return first(await db.update(products).set(data).where(eq(products.id, id)).returning());
  }
  async deleteProduct(id: number): Promise<boolean> {
    const rows = await db.delete(products).where(eq(products.id, id)).returning({ id: products.id });
    return rows.length > 0;
  }

  async createOrder(data: Partial<Order>): Promise<Order> {
    const rows = await db.insert(orders).values({ ...(data as any), createdAt: Math.floor(Date.now() / 1000) }).returning();
    return rows[0];
  }
  async updateOrderBySession(sessionId: string, patch: Partial<Order>) {
    return first(await db.update(orders).set(patch).where(eq(orders.stripeSessionId, sessionId)).returning());
  }
  async listOrders() { return db.select().from(orders).orderBy(desc(orders.createdAt)); }
  async getOrderById(id: number): Promise<Order | undefined> {
    return first(await db.select().from(orders).where(eq(orders.id, id)));
  }
  async createOrderItems(items: InsertOrderItem[]): Promise<OrderItem[]> {
    if (items.length === 0) return [];
    return await db.insert(orderItems).values(items).returning();
  }
  async listOrderItems(orderId: number): Promise<OrderItem[]> {
    return await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  }

  async listVariants(productId?: number): Promise<ProductVariant[]> {
    if (productId !== undefined) {
      return await db.select().from(productVariants).where(eq(productVariants.productId, productId));
    }
    return await db.select().from(productVariants);
  }
  async getVariant(productId: number, size: string | null): Promise<ProductVariant | undefined> {
    // COALESCE match for NULL sizes.
    const rows = await db.select().from(productVariants).where(
      sql`${productVariants.productId} = ${productId} AND COALESCE(${productVariants.size}, '') = COALESCE(${size}, '')`
    );
    return rows[0];
  }
  async upsertVariant(data: InsertProductVariant): Promise<ProductVariant> {
    const existing = await this.getVariant(data.productId, data.size ?? null);
    if (existing) return existing;
    const rows = await db.insert(productVariants).values(data).returning();
    return rows[0];
  }
  async updateVariantQuantity(id: number, quantity: number, unlimitedStock?: boolean): Promise<ProductVariant | undefined> {
    const patch: Partial<InsertProductVariant> = { quantity };
    if (unlimitedStock !== undefined) patch.unlimitedStock = unlimitedStock;
    return first(await db.update(productVariants).set(patch).where(eq(productVariants.id, id)).returning());
  }
  async reserveStock(productId: number, size: string | null, quantity: number): Promise<boolean> {
    // Atomic conditional decrement. Only decrements if quantity is sufficient OR variant is unlimited.
    // Returns true if a row was updated, false if oversell would occur.
    const result = await db.execute(sql`
      UPDATE product_variants
      SET quantity = CASE WHEN unlimited_stock THEN quantity ELSE quantity - ${quantity} END
      WHERE product_id = ${productId}
        AND COALESCE(size, '') = COALESCE(${size}, '')
        AND (unlimited_stock = true OR quantity >= ${quantity})
      RETURNING id
    `);
    return (result as any).rowCount > 0 || ((result as any).rows && (result as any).rows.length > 0);
  }
  async releaseStock(productId: number, size: string | null, quantity: number): Promise<void> {
    await db.execute(sql`
      UPDATE product_variants
      SET quantity = quantity + ${quantity}
      WHERE product_id = ${productId}
        AND COALESCE(size, '') = COALESCE(${size}, '')
        AND unlimited_stock = false
    `);
  }

  async listCrew() { return db.select().from(crewMembers).orderBy(crewMembers.displayOrder); }
  async createCrewMember(data: InsertCrew) {
    const rows = await db.insert(crewMembers).values(data).returning();
    return rows[0];
  }
  async updateCrewMember(id: number, data: Partial<InsertCrew>) {
    return first(await db.update(crewMembers).set(data).where(eq(crewMembers.id, id)).returning());
  }
  async deleteCrewMember(id: number): Promise<boolean> {
    const rows = await db.delete(crewMembers).where(eq(crewMembers.id, id)).returning({ id: crewMembers.id });
    return rows.length > 0;
  }

  async getUserByUsername(username: string) {
    return first(await db.select().from(users).where(eq(users.username, username)));
  }
  async createUser(u: InsertUser & { isAdmin?: boolean }) {
    const rows = await db.insert(users).values({
      username: u.username,
      password: u.password,
      isAdmin: !!u.isAdmin,
    }).returning();
    return rows[0];
  }
}

export const storage = new DatabaseStorage();

// ============ EVENT CONFIG (idempotent, runs every boot) ============
// Owner: keep this in sync with what the crew wants live on the site.
async function applyEventConfig() {
  // Delete Round 3 if it exists (invite-only two-round schedule)
  await db.delete(events).where(eq(events.slug, "round-3-night-slide"));

  // Upsert Round 1: Sat Sep 26, 2026 10 AM – 8 PM ET, Private Practice
  await db.insert(events).values({
    slug: "round-1-forest-city",
    title: "ROUND 1",
    subtitle: "Private Practice",
    description: "Invite-only practice day. All-day open track for our crew. Ride-alongs by arrangement. Spectators by invite.",
    location: "Forest City, NC",
    venue: "Chaos Cartel Track",
    startsAt: 1790431200, // Sat Sep 26 2026 10:00 AM EDT
    endsAt: 1790467200,   // Sat Sep 26 2026 8:00 PM EDT
    driverPriceCents: 11000,
    driverSlots: 15,
    rideAlongPriceCents: 2500,
    rideAlongSlots: 15,
    spectatorPriceCents: 1000,
    spectatorSlots: 45,
    status: "published",
    heroImageUrl: null,
    inviteCode: "TIRE-FIRE-926",
    createdAt: Math.floor(Date.now() / 1000),
  }).onConflictDoUpdate({
    target: events.slug,
    set: {
      title: "ROUND 1",
      subtitle: "Private Practice",
      description: "Invite-only practice day. All-day open track for our crew. Ride-alongs by arrangement. Spectators by invite.",
      startsAt: 1790431200,
      endsAt: 1790467200,
      driverSlots: 15,
      rideAlongSlots: 15,
      spectatorSlots: 45,
      status: "published",
      inviteCode: "TIRE-FIRE-926",
    },
  });

  // Upsert Round 2: Sat Oct 17, 2026 10 AM – 8 PM ET, Private Practice
  await db.insert(events).values({
    slug: "round-2-seat-time-saturday",
    title: "ROUND 2",
    subtitle: "Private Practice",
    description: "Invite-only practice day. All-day open track for our crew. Ride-alongs by arrangement. Spectators by invite.",
    location: "Forest City, NC",
    venue: "Chaos Cartel Track",
    startsAt: 1792245600, // Sat Oct 17 2026 10:00 AM EDT
    endsAt: 1792281600,   // Sat Oct 17 2026 8:00 PM EDT
    driverPriceCents: 12000,
    driverSlots: 15,
    rideAlongPriceCents: 2500,
    rideAlongSlots: 15,
    spectatorPriceCents: 1000,
    spectatorSlots: 45,
    status: "published",
    heroImageUrl: null,
    inviteCode: "APEX-CULT-1017",
    createdAt: Math.floor(Date.now() / 1000),
  }).onConflictDoUpdate({
    target: events.slug,
    set: {
      title: "ROUND 2",
      subtitle: "Private Practice",
      description: "Invite-only practice day. All-day open track for our crew. Ride-alongs by arrangement. Spectators by invite.",
      startsAt: 1792245600,
      endsAt: 1792281600,
      driverSlots: 15,
      rideAlongSlots: 15,
      spectatorSlots: 45,
      status: "published",
      inviteCode: "APEX-CULT-1017",
    },
  });

  console.log("[config] Events synced (2 published rounds, invite-only)");
}

// ============ PRODUCT CATALOG APPLY ============
// Idempotent: ensures the six catalog products exist and have current imageUrl.
// Safe to run on every boot.
async function applyProductImages() {
  const catalog: InsertProduct[] = [
    { slug: "chaos-cartel-tee-black", name: "Chaos Cartel Tee — Black",
      description: "Heavyweight 100% cotton tee. Big neon Chaos Cartel wordmark on the front, small crew mark on the back.",
      priceCents: 3500, imageUrl: "/merch/tee.jpg", category: "apparel",
      sizes: JSON.stringify(["S", "M", "L", "XL", "XXL"]), inStock: true },
    { slug: "smoke-hoodie", name: "Tire Smoke Hoodie",
      description: "Midweight fleece hoodie with a full-front print of the Chaos Cartel logo.",
      priceCents: 6500, imageUrl: "/merch/hoodie.png", category: "apparel",
      sizes: JSON.stringify(["S", "M", "L", "XL", "XXL"]), inStock: true },
    { slug: "chaos-cartel-sticker-pack", name: "Sticker Pack — 5 Pack",
      description: "Five 3\" die-cut vinyl stickers. Weatherproof. Slap them on your helmet, cage, or toolbox.",
      priceCents: 1000, imageUrl: "/merch/stickers.png", category: "stickers",
      sizes: null, inStock: true },
    { slug: "chaos-cartel-snapback", name: "Chaos Cartel Snapback",
      description: "Structured flat-brim snapback. Embroidered neon Chaos Cartel wordmark on the front. One size fits most.",
      priceCents: 3000, imageUrl: "/merch/hat.png", category: "headwear",
      sizes: null, inStock: true },
    { slug: "chaos-cartel-decal-sheet", name: "Car Decal Sheet — 6 Pack",
      description: "Six large weatherproof vinyl decals sized for windshield, door panels, and quarter panels. Kiss-cut on a single 12x18 sheet.",
      priceCents: 2500, imageUrl: "/merch/decals.png", category: "decals",
      sizes: null, inStock: true },
    { slug: "chaos-cartel-driver-jersey", name: "Driver Jersey",
      description: "Long-sleeve moisture-wicking jersey with color-blocked neon side panels. Your number goes on the right chest — leave a note at checkout.",
      priceCents: 8500, imageUrl: "/merch/jersey.png", category: "apparel",
      sizes: JSON.stringify(["S", "M", "L", "XL", "XXL"]), inStock: true },
  ];
  for (const p of catalog) {
    const existing = await storage.getProductBySlug(p.slug);
    if (!existing) {
      await storage.createProduct(p);
    } else if (!existing.imageUrl || existing.imageUrl === "") {
      await db.update(products).set({ imageUrl: p.imageUrl }).where(eq(products.id, existing.id));
    }
  }
  // Backfill per-size stock rows for every catalog product. Idempotent — upsertVariant
  // skips if a row already exists, so admin adjustments are never overwritten.
  // Defaults: unlimited for stickers/decals (print-on-demand), 10 per size for apparel,
  // 5 for jerseys, 8 for the snapback (one size).
  const initialStock: Record<string, { qty: number; unlimited: boolean }> = {
    "chaos-cartel-tee-black":     { qty: 10, unlimited: false },
    "smoke-hoodie":                { qty: 8,  unlimited: false },
    "chaos-cartel-driver-jersey":  { qty: 5,  unlimited: false },
    "chaos-cartel-snapback":       { qty: 8,  unlimited: false },
    "chaos-cartel-sticker-pack":   { qty: 0,  unlimited: true },
    "chaos-cartel-decal-sheet":    { qty: 0,  unlimited: true },
  };
  for (const p of catalog) {
    const product = await storage.getProductBySlug(p.slug);
    if (!product) continue;
    const defaults = initialStock[p.slug] ?? { qty: 10, unlimited: false };
    const sizeList: (string | null)[] = p.sizes
      ? (JSON.parse(p.sizes as string) as string[])
      : [null];
    for (const size of sizeList) {
      await storage.upsertVariant({
        productId: product.id,
        size,
        quantity: defaults.qty,
        unlimitedStock: defaults.unlimited,
      });
    }
  }
  console.log("[config] Product catalog + stock synced");
}

// ============ CREW FIXUPS ============
// One-time cleanup that runs on every boot but is guarded so admin edits are respected.
// Only touches rows that still hold seed / prior-migration placeholder values.
async function applyCrewFixups() {
  const all = await db.select().from(crewMembers);
  // 1. If Rob still has his original seed bio, upgrade to real details.
  const rob = all.find(c => c.name === "Rob" && c.bio === "Started Chaos Cartel out of Rob's Rod Shop. Runs the show and the track.");
  if (rob) {
    await db.update(crewMembers).set({
      name: "Rob D",
      role: "Founder / Driver / Instructor",
      car: "1996 240SX 400ci LS",
      bio: "Founder, driver, instructor.",
      imageUrl: "/crew/rob.jpg",
    }).where(eq(crewMembers.id, rob.id));
    console.log("[config] Updated Rob's crew card with real details");
  }
  // 2. Delete the "Coach / Tech" TBD placeholder if it still has its original bio.
  const tbdCoach = all.find(c => c.name === "TBD" && c.role === "Coach / Tech" && c.bio === "Handles rookie coaching and pre-run tech inspections.");
  if (tbdCoach) {
    await db.delete(crewMembers).where(eq(crewMembers.id, tbdCoach.id));
    console.log("[config] Removed Coach/Tech TBD placeholder");
  }
  // 3. Upgrade the "Driver" TBD placeholder to Josh Dalton (JD) if it still holds its placeholder bio.
  const tbdDriver = all.find(c => c.name === "TBD" && c.role === "Driver" && c.bio === "Roster spot \u2014 add your crew from the admin panel.");
  if (tbdDriver) {
    await db.update(crewMembers).set({
      name: "Josh Dalton (JD)",
      role: "Founder / Driver / Instructor",
      car: "RHD S13 Silvia — Turbo LS3",
      bio: "Founder, driver, instructor.",
      imageUrl: "/crew/jd.jpg",
    }).where(eq(crewMembers.id, tbdDriver.id));
    console.log("[config] Updated Driver TBD to Josh Dalton");
  }
  // 4. Backfill Rob's photo / bio / role upgrade if he was already migrated in a prior boot.
  const robD = all.find(c => c.name === "Rob D" && (c.bio === "Founder, instructor." || !c.imageUrl));
  if (robD) {
    await db.update(crewMembers).set({
      role: "Founder / Driver / Instructor",
      bio: "Founder, driver, instructor.",
      imageUrl: "/crew/rob.jpg",
    }).where(eq(crewMembers.id, robD.id));
    console.log("[config] Backfilled Rob's photo / bio");
  }
  // 5. Backfill JD's photo / bio / role upgrade if he was already migrated in a prior boot.
  const jd = all.find(c => c.name === "Josh Dalton (JD)" && (c.bio === "Driver." || !c.imageUrl));
  if (jd) {
    await db.update(crewMembers).set({
      role: "Founder / Driver / Instructor",
      bio: "Founder, driver, instructor.",
      imageUrl: "/crew/jd.jpg",
    }).where(eq(crewMembers.id, jd.id));
    console.log("[config] Backfilled JD's photo / bio");
  }
}

// ============ SEED PLACEHOLDER DATA ============
// Runs once on empty DB. Safe to leave enabled — no-op if events already exist.
export async function seed() {
  await bootstrapSchema();
  // Apply event config on every boot (idempotent upsert)
  await applyEventConfig();
  // Backfill product images if missing (idempotent)
  await applyProductImages();
  // Apply crew fixups (idempotent — guarded by seed-value checks)
  await applyCrewFixups();
  const existing = await db.select().from(events);
  // Existing events (which include the two we just upserted) means the initial
  // seed of products/crew/admin already ran on a prior boot.
  if (existing.length > 0) return;
  const now = Math.floor(Date.now() / 1000);
  const day = 86400;
  await storage.createEvent({
    slug: "round-1-forest-city",
    title: "ROUND 1",
    subtitle: "Open Drift Practice",
    description: "Season opener. All-day open track for drivers who want seat time. Ride-alongs open all day. Spectators welcome — bring a chair, bring earplugs.",
    location: "Forest City, NC",
    venue: "Chaos Cartel Track",
    startsAt: now + 21 * day,
    endsAt: now + 21 * day + 6 * 3600,
    driverPriceCents: 11000,
    driverSlots: 24,
    rideAlongPriceCents: 2500,
    rideAlongSlots: 40,
    spectatorPriceCents: 1000,
    spectatorSlots: 200,
    status: "published",
    heroImageUrl: null,
  });
  await storage.createEvent({
    slug: "round-2-seat-time-saturday",
    title: "ROUND 2",
    subtitle: "Seat Time Saturday",
    description: "Half-day mid-season practice. Great for beginners looking for coached seat time. Limited driver spots.",
    location: "Forest City, NC",
    venue: "Chaos Cartel Track",
    startsAt: now + 42 * day,
    endsAt: now + 42 * day + 6 * 3600,
    driverPriceCents: 12000,
    driverSlots: 18,
    rideAlongPriceCents: 2500,
    rideAlongSlots: 32,
    spectatorPriceCents: 1000,
    spectatorSlots: 200,
    status: "published",
    heroImageUrl: null,
  });
  await storage.createEvent({
    slug: "round-3-night-slide",
    title: "ROUND 3",
    subtitle: "Night Slide",
    description: "After-dark session under the lights. Sparks and flames — literally. Reduced driver count.",
    location: "Forest City, NC",
    venue: "Chaos Cartel Track",
    startsAt: now + 70 * day,
    endsAt: now + 70 * day + 5 * 3600,
    driverPriceCents: 13500,
    driverSlots: 16,
    rideAlongPriceCents: 3000,
    rideAlongSlots: 30,
    spectatorPriceCents: 1500,
    spectatorSlots: 200,
    status: "published",
    heroImageUrl: null,
  });

  // Product catalog is created/updated by applyProductImages() on every boot.

  await storage.createCrewMember({
    name: "Rob",
    role: "Founder / Lead Driver",
    car: "1986 Toyota Corolla AE86",
    bio: "Started Chaos Cartel out of Rob's Rod Shop. Runs the show and the track.",
    imageUrl: null,
    instagram: null,
    displayOrder: 0,
  });
  await storage.createCrewMember({
    name: "TBD",
    role: "Driver",
    car: "Nissan 240SX",
    bio: "Roster spot — add your crew from the admin panel.",
    imageUrl: null,
    instagram: null,
    displayOrder: 1,
  });
  await storage.createCrewMember({
    name: "TBD",
    role: "Coach / Tech",
    car: "BMW E36",
    bio: "Handles rookie coaching and pre-run tech inspections.",
    imageUrl: null,
    instagram: null,
    displayOrder: 2,
  });

  // Default admin user — override via ADMIN_USERNAME / ADMIN_PASSWORD in production.
  await storage.createUser({
    username: process.env.ADMIN_USERNAME || "admin",
    password: process.env.ADMIN_PASSWORD || "chaoscartel",
    isAdmin: true,
  });
  console.log("[seed] Chaos Cartel bootstrap complete");
}
