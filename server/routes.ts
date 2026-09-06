import type { Express, Request, Response, NextFunction } from "express";
import type { Server } from 'node:http';
import session from 'express-session';
import MemoryStore from 'memorystore';
import { storage } from "./storage";
import {
  bookingPayloadSchema,
  merchOrderPayloadSchema,
  cartCheckoutPayloadSchema,
  insertEventSchema,
  insertProductSchema,
  insertCrewSchema,
} from "@shared/schema";
import { z } from "zod";
import { ensureConfirmationCode, sendConfirmationEmail, generateRosterPdf, ticketQrPng } from "./tickets";

const STRIPE_API_LIVE = "https://api.stripe.com/v1";
// Stripe is called directly on Railway using STRIPE_SECRET_KEY. In the preview
// sandbox we don't have direct outbound to api.stripe.com, so we run in
// "preview mode" — the booking flow returns a fake checkout URL that lands on
// /#/thanks so the UX can be walked end-to-end without real payments.
const APP_BASE_URL = process.env.APP_BASE_URL || "http://localhost:5000";
const STRIPE_MODE: "live" | "preview" = process.env.STRIPE_SECRET_KEY ? "live" : "preview";
const IS_STRIPE_CONFIGURED = true; // always show checkout button; preview mode fakes it

// Helper: form-urlencode object with dotted keys (Stripe convention)
function stripeEncode(obj: Record<string, any>, prefix = ""): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === "object" && !Array.isArray(v)) {
      parts.push(stripeEncode(v, key));
    } else if (Array.isArray(v)) {
      v.forEach((item, i) => {
        if (typeof item === "object") parts.push(stripeEncode(item, `${key}[${i}]`));
        else parts.push(`${encodeURIComponent(`${key}[${i}]`)}=${encodeURIComponent(String(item))}`);
      });
    } else {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
    }
  }
  return parts.filter(Boolean).join("&");
}

async function stripeCall(path: string, body?: Record<string, any>): Promise<any> {
  if (STRIPE_MODE !== "live") {
    throw new Error("Stripe called in preview mode \u2014 caller should short-circuit");
  }
  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
    Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
  };
  const res = await fetch(`${STRIPE_API_LIVE}${path}`, {
    method: body ? "POST" : "GET",
    headers,
    body: body ? stripeEncode(body) : undefined,
  });
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok) {
    const err = new Error(json?.error?.message || `Stripe ${res.status}`);
    (err as any).status = res.status;
    (err as any).stripe = json;
    throw err;
  }
  return json;
}

// ============ AUTH MIDDLEWARE ============
declare module "express-session" {
  interface SessionData {
    userId?: number;
    isAdmin?: boolean;
  }
}

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.isAdmin) return res.status(401).json({ message: "Admin login required" });
  next();
}

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  // Sessions (in-memory; fine for single-node Railway service)
  const MStore = MemoryStore(session);
  app.use(session({
    secret: process.env.SESSION_SECRET || "chaos-cartel-dev-secret-change-in-prod",
    resave: false,
    saveUninitialized: false,
    store: new MStore({ checkPeriod: 86400000 }),
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 7 * 24 * 3600 * 1000,
    },
  }));

  // ============ EVENTS ============
  // Strip inviteCode from public responses; expose only a boolean flag.
  const publicEvent = (e: any) => {
    const { inviteCode, ...rest } = e;
    return { ...rest, requiresInviteCode: !!inviteCode };
  };

  app.get("/api/events", async (_req, res) => {
    const events = await storage.listEvents();
    res.json(events.filter(e => e.status === "published").map(publicEvent));
  });

  app.get("/api/events/:slug", async (req, res) => {
    const event = await storage.getEventBySlug(req.params.slug);
    if (!event) return res.status(404).json({ message: "Event not found" });
    res.json(publicEvent(event));
  });

  // ============ CREW ============
  app.get("/api/crew", async (_req, res) => {
    const crew = await storage.listCrew();
    res.json(crew);
  });

  // ============ PRODUCTS ============
  app.get("/api/products", async (_req, res) => {
    const products = await storage.listProducts();
    // Enrich each product with per-size stock so the merch page can disable OOS sizes
    // and hide fully sold-out products without an extra round-trip.
    const allVariants = await storage.listVariants();
    const byProduct = new Map<number, { size: string | null; quantity: number; unlimitedStock: boolean }[]>();
    for (const v of allVariants) {
      const arr = byProduct.get(v.productId) ?? [];
      arr.push({ size: v.size, quantity: v.quantity, unlimitedStock: v.unlimitedStock });
      byProduct.set(v.productId, arr);
    }
    const enriched = products.map(p => {
      const variants = byProduct.get(p.id) ?? [];
      // Aggregate stock: unlimited if any variant is unlimited, else sum quantities.
      const anyUnlimited = variants.some(v => v.unlimitedStock);
      const totalStock = anyUnlimited ? null : variants.reduce((s, v) => s + Math.max(0, v.quantity), 0);
      return { ...p, variants, totalStock };
    });
    res.json(enriched);
  });

  // Shipping helper. One shipping charge per order.
  // Cart rule: if EVERY item in the cart is a flat/envelope item (stickers or decals),
  // charge the envelope rate ($3). Otherwise charge the standard rate ($7) once.
  // Env overrides: SHIP_FLAT_ENVELOPE_CENTS, SHIP_FLAT_STANDARD_CENTS.
  function computeShipping(categories: string[]) {
    const isFlatEnvelope = categories.length > 0 &&
      categories.every(c => c === "stickers" || c === "decals");
    const shippingCents = isFlatEnvelope
      ? parseInt(process.env.SHIP_FLAT_ENVELOPE_CENTS || "300", 10)
      : parseInt(process.env.SHIP_FLAT_STANDARD_CENTS || "700", 10);
    return {
      shippingCents,
      label: isFlatEnvelope ? "USPS First-Class Envelope" : "USPS Ground Advantage",
      etaDays: isFlatEnvelope ? "3-5 business days" : "5-7 business days",
      etaMin: isFlatEnvelope ? 3 : 5,
      etaMax: isFlatEnvelope ? 5 : 7,
    };
  }

  // Public shipping quote for the merch modal + cart drawer. Accepts either a single
  // ?category=X (legacy) or ?categories=a,b,c for a cart of mixed categories.
  app.get("/api/shipping-quote", (req, res) => {
    const csv = String(req.query.categories || req.query.category || "");
    const categories = csv.split(",").map(s => s.trim()).filter(Boolean);
    const q = computeShipping(categories);
    res.json({ shippingCents: q.shippingCents, label: q.label, etaDays: q.etaDays });
  });
  app.get("/api/products/:slug", async (req, res) => {
    const p = await storage.getProductBySlug(req.params.slug);
    if (!p) return res.status(404).json({ message: "Product not found" });
    res.json(p);
  });

  // ============ BOOKING: CREATE STRIPE CHECKOUT ============
  app.post("/api/bookings", async (req, res, next) => {
    try {
      const payload = bookingPayloadSchema.parse(req.body);
      const event = await storage.getEventById(payload.eventId);
      if (!event) return res.status(404).json({ message: "Event not found" });
      if (event.status !== "published") return res.status(400).json({ message: "Event not available" });

      // Invite-code gate (case-insensitive, whitespace-trimmed)
      if (event.inviteCode) {
        const supplied = (payload.inviteCode || "").trim().toUpperCase();
        const expected = event.inviteCode.trim().toUpperCase();
        if (!supplied || supplied !== expected) {
          return res.status(403).json({ message: "Invalid invite code for this event" });
        }
      }

      // Normalize driver-only add-ons (ignored on other ticket types).
      const isDriver = payload.ticketType === "driver";
      const crewMemberName = isDriver ? (payload.crewMemberName?.trim() || null) : null;
      const extraSpectators = isDriver ? Math.max(0, Math.min(4, payload.extraSpectators ?? 0)) : 0;
      const extraRideAlongs = isDriver ? Math.max(0, Math.min(4, payload.extraRideAlongs ?? 0)) : 0;

      // Capacity check
      let priceCents = 0;
      let itemName = "";
      if (payload.ticketType === "driver") {
        if (event.driverRemaining <= 0) return res.status(400).json({ message: "Driver spots sold out" });
        if (!payload.techInspection || !payload.experienceLevel || !payload.carMake) {
          return res.status(400).json({ message: "Driver registration requires car details, tech inspection, and experience level" });
        }
        // Paid extras need actual capacity. The 1 free crew guest is a bring-a-friend, not a ticketed seat.
        if (extraSpectators > 0 && event.spectatorRemaining < extraSpectators) {
          return res.status(400).json({ message: `Only ${event.spectatorRemaining} spectator spots left \u2014 reduce extra spectators.` });
        }
        if (extraRideAlongs > 0 && event.rideAlongRemaining < extraRideAlongs) {
          return res.status(400).json({ message: `Only ${event.rideAlongRemaining} ride-along spots left \u2014 reduce extra ride-alongs.` });
        }
        priceCents = event.driverPriceCents
          + (extraSpectators * event.spectatorPriceCents)
          + (extraRideAlongs * event.rideAlongPriceCents);
        itemName = `${event.title} \u2014 Driver Entry`;
      } else if (payload.ticketType === "ride_along") {
        if (event.rideAlongRemaining <= 0) return res.status(400).json({ message: "Ride-along spots sold out" });
        priceCents = event.rideAlongPriceCents;
        itemName = `${event.title} — Ride-Along`;
      } else {
        if (event.spectatorRemaining <= 0) return res.status(400).json({ message: "Spectator spots sold out" });
        priceCents = event.spectatorPriceCents;
        itemName = `${event.title} — Spectator`;
      }

      // Create pending registration first
      const reg = await storage.createRegistration({
        eventId: event.id,
        ticketType: payload.ticketType,
        firstName: payload.firstName,
        lastName: payload.lastName,
        email: payload.email,
        phone: payload.phone,
        emergencyContactName: payload.emergencyContactName || null,
        emergencyContactPhone: payload.emergencyContactPhone || null,
        carYear: payload.carYear || null,
        carMake: payload.carMake || null,
        carModel: payload.carModel || null,
        carColor: payload.carColor || null,
        techInspection: payload.techInspection ? JSON.stringify(payload.techInspection) : null,
        experienceLevel: payload.experienceLevel || null,
        crewMemberName,
        extraSpectators,
        extraRideAlongs,
        waiverSigned: true,
        waiverSignedAt: Math.floor(Date.now() / 1000),
        waiverSignatureName: payload.waiverSignatureName,
        paymentStatus: "pending",
        amountPaidCents: 0,
      });

      // Determine base URL: use APP_BASE_URL when set, else derive from request
      const baseUrl = process.env.APP_BASE_URL || `${req.protocol}://${req.get("host")}`;

      let checkoutUrl: string;
      // Preview mode: skip Stripe entirely and drop the user straight on /#/thanks.
      if (STRIPE_MODE === "preview") {
        const { db } = await import("./storage");
        const { registrations } = await import("@shared/schema");
        const { eq } = await import("drizzle-orm");
        const fakeSession = `preview_reg_${reg.id}_${Date.now()}`;
        await db.update(registrations)
          .set({ stripeSessionId: fakeSession, paymentStatus: "preview", amountPaidCents: priceCents })
          .where(eq(registrations.id, reg.id));
        return res.json({ checkoutUrl: `${baseUrl}/#/thanks?type=registration&id=${reg.id}&preview=1`, previewMode: true });
      }
      try {
        // Build the base line item (driver / ride_along / spectator). For drivers we
        // use the base driver price, then append separate line items for each paid extra so
        // it's itemized on the Stripe receipt.
        const baseLinePrice = isDriver ? event.driverPriceCents : priceCents;
        const stripeParams: Record<string, any> = {
          mode: "payment",
          "payment_method_types[0]": "card",
          "line_items[0][price_data][currency]": "usd",
          "line_items[0][price_data][unit_amount]": baseLinePrice,
          "line_items[0][price_data][product_data][name]": itemName,
          "line_items[0][price_data][product_data][description]":
            isDriver && crewMemberName
              ? `${payload.firstName} ${payload.lastName} + ${crewMemberName} (free crew) \u2014 ${event.location}`
              : `${payload.firstName} ${payload.lastName} \u2014 ${event.location}`,
          "line_items[0][quantity]": 1,
          customer_email: payload.email,
          "metadata[registration_id]": reg.id,
          "metadata[event_id]": event.id,
          "metadata[ticket_type]": payload.ticketType,
          "metadata[extra_spectators]": extraSpectators,
          "metadata[extra_ride_alongs]": extraRideAlongs,
          "metadata[kind]": "registration",
          success_url: `${baseUrl}/#/thanks?type=registration&id=${reg.id}`,
          cancel_url: `${baseUrl}/#/sessions/${event.slug}?canceled=1`,
          "payment_intent_data[metadata][registration_id]": reg.id,
        };
        let liIdx = 1;
        if (isDriver && extraSpectators > 0) {
          stripeParams[`line_items[${liIdx}][price_data][currency]`] = "usd";
          stripeParams[`line_items[${liIdx}][price_data][unit_amount]`] = event.spectatorPriceCents;
          stripeParams[`line_items[${liIdx}][price_data][product_data][name]`] = `${event.title} \u2014 Extra Spectator`;
          stripeParams[`line_items[${liIdx}][price_data][product_data][description]`] = `Additional guest at spectator rate`;
          stripeParams[`line_items[${liIdx}][quantity]`] = extraSpectators;
          liIdx++;
        }
        if (isDriver && extraRideAlongs > 0) {
          stripeParams[`line_items[${liIdx}][price_data][currency]`] = "usd";
          stripeParams[`line_items[${liIdx}][price_data][unit_amount]`] = event.rideAlongPriceCents;
          stripeParams[`line_items[${liIdx}][price_data][product_data][name]`] = `${event.title} \u2014 Extra Ride-Along`;
          stripeParams[`line_items[${liIdx}][price_data][product_data][description]`] = `Additional guest with ride-along access`;
          stripeParams[`line_items[${liIdx}][quantity]`] = extraRideAlongs;
          liIdx++;
        }
        const session = await stripeCall("/checkout/sessions", stripeParams);
        // Save session id on the registration
        const { db } = await import("./storage");
        const { registrations } = await import("@shared/schema");
        const { eq } = await import("drizzle-orm");
        await db.update(registrations).set({ stripeSessionId: session.id }).where(eq(registrations.id, reg.id));
        checkoutUrl = session.url;
      } catch (err: any) {
        console.error("Stripe checkout error:", err);
        return res.status(502).json({
          message: `Payment setup failed: ${err.message}. Your registration is saved; check with the crew if you were charged.`,
        });
      }

      res.json({ registrationId: reg.id, checkoutUrl });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid booking data", errors: err.issues });
      }
      next(err);
    }
  });

  // ============ MERCH: CREATE STRIPE CHECKOUT ============
  app.post("/api/merch-orders", async (req, res, next) => {
    try {
      const payload = merchOrderPayloadSchema.parse(req.body);
      const product = await storage.getProductById(payload.productId);
      if (!product || !product.inStock) return res.status(404).json({ message: "Product unavailable" });

      // Legacy single-item path also honors per-size stock.
      const reservedOk = await storage.reserveStock(product.id, payload.size || null, 1);
      if (!reservedOk) {
        const label = payload.size ? `${product.name} (size ${payload.size})` : product.name;
        return res.status(409).json({ message: `Sorry — ${label} is out of stock.` });
      }

      const order = await storage.createOrder({
        productId: product.id,
        size: payload.size || null,
        firstName: payload.firstName,
        lastName: payload.lastName,
        email: payload.email,
        phone: payload.phone || null,
        shippingAddress: payload.shippingAddress,
        shippingCity: payload.shippingCity,
        shippingState: payload.shippingState,
        shippingZip: payload.shippingZip,
        paymentStatus: "pending",
        amountPaidCents: 0,
      });

      const baseUrl = process.env.APP_BASE_URL || `${req.protocol}://${req.get("host")}`;
      const sizeSuffix = payload.size ? ` (${payload.size})` : "";

      // Flat-rate shipping. Small flat items (stickers / decals) ship in a stamped envelope for $3.
      // Everything else (apparel, hats, jerseys) ships $7 flat, 5-7 business days.
      const isFlatEnvelope = product.category === "stickers" || product.category === "decals";
      const shippingCents = isFlatEnvelope
        ? parseInt(process.env.SHIP_FLAT_ENVELOPE_CENTS || "300", 10)
        : parseInt(process.env.SHIP_FLAT_STANDARD_CENTS || "700", 10);
      const shippingLabel = isFlatEnvelope ? "USPS First-Class Envelope" : "USPS Ground Advantage";
      const shippingEta = isFlatEnvelope ? { min: 3, max: 5 } : { min: 5, max: 7 };

      if (STRIPE_MODE === "preview") {
        const { db } = await import("./storage");
        const { orders } = await import("@shared/schema");
        const { eq } = await import("drizzle-orm");
        const fakeSession = `preview_order_${order.id}_${Date.now()}`;
        await db.update(orders)
          .set({ stripeSessionId: fakeSession, paymentStatus: "preview", amountPaidCents: product.priceCents + shippingCents })
          .where(eq(orders.id, order.id));
        return res.json({ orderId: order.id, checkoutUrl: `${baseUrl}/#/thanks?type=merch&id=${order.id}&preview=1`, previewMode: true });
      }
      const session = await stripeCall("/checkout/sessions", {
        mode: "payment",
        "payment_method_types[0]": "card",
        "line_items[0][price_data][currency]": "usd",
        "line_items[0][price_data][unit_amount]": product.priceCents,
        "line_items[0][price_data][product_data][name]": `${product.name}${sizeSuffix}`,
        "line_items[0][price_data][product_data][description]": product.description.substring(0, 200),
        "line_items[0][quantity]": 1,
        customer_email: payload.email,
        "shipping_address_collection[allowed_countries][0]": "US",
        "shipping_options[0][shipping_rate_data][type]": "fixed_amount",
        "shipping_options[0][shipping_rate_data][display_name]": shippingLabel,
        "shipping_options[0][shipping_rate_data][fixed_amount][amount]": shippingCents,
        "shipping_options[0][shipping_rate_data][fixed_amount][currency]": "usd",
        "shipping_options[0][shipping_rate_data][delivery_estimate][minimum][unit]": "business_day",
        "shipping_options[0][shipping_rate_data][delivery_estimate][minimum][value]": shippingEta.min,
        "shipping_options[0][shipping_rate_data][delivery_estimate][maximum][unit]": "business_day",
        "shipping_options[0][shipping_rate_data][delivery_estimate][maximum][value]": shippingEta.max,
        "metadata[order_id]": order.id,
        "metadata[kind]": "merch",
        "metadata[shipping_cents]": shippingCents,
        success_url: `${baseUrl}/#/thanks?type=merch&id=${order.id}`,
        cancel_url: `${baseUrl}/#/merch?canceled=1`,
      });

      const { db } = await import("./storage");
      const { orders } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      await db.update(orders).set({ stripeSessionId: session.id }).where(eq(orders.id, order.id));

      res.json({ orderId: order.id, checkoutUrl: session.url });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: "Invalid order", errors: err.issues });
      next(err);
    }
  });

  // ============ MERCH: CART CHECKOUT (multi-item) ============
  // Creates a parent Order + N OrderItems, then a Stripe Checkout Session with one
  // line_item per cart entry plus one flat shipping charge for the whole order.
  app.post("/api/cart-checkout", async (req, res, next) => {
    try {
      const payload = cartCheckoutPayloadSchema.parse(req.body);

      // Load and validate every product server-side. Never trust client prices.
      const productMap = new Map<number, any>();
      for (const item of payload.items) {
        if (productMap.has(item.productId)) continue;
        const p = await storage.getProductById(item.productId);
        if (!p || !p.inStock) return res.status(400).json({ message: `Product ${item.productId} unavailable` });
        productMap.set(item.productId, p);
      }

      // Reserve stock atomically for every line. If any reservation fails, roll back
      // everything already reserved so we don't leak inventory on a partial failure.
      const reserved: { productId: number; size: string | null; quantity: number }[] = [];
      for (const item of payload.items) {
        const p = productMap.get(item.productId)!;
        const size = item.size || null;
        const ok = await storage.reserveStock(p.id, size, item.quantity);
        if (!ok) {
          // Roll back prior reservations.
          for (const r of reserved) await storage.releaseStock(r.productId, r.size, r.quantity);
          const label = size ? `${p.name} (size ${size})` : p.name;
          return res.status(409).json({ message: `Sorry — ${label} is out of stock or does not have enough available. Please refresh and try again.` });
        }
        reserved.push({ productId: p.id, size, quantity: item.quantity });
      }

      // Compute totals + shipping.
      let subtotalCents = 0;
      const categories: string[] = [];
      const itemsResolved = payload.items.map(item => {
        const p = productMap.get(item.productId)!;
        subtotalCents += p.priceCents * item.quantity;
        categories.push(p.category);
        return { item, product: p };
      });
      const ship = computeShipping(categories);

      // Create parent order (multi-item: product_id/size stay null).
      const order = await storage.createOrder({
        productId: null,
        size: null,
        firstName: payload.firstName,
        lastName: payload.lastName,
        email: payload.email,
        phone: payload.phone || null,
        shippingAddress: payload.shippingAddress,
        shippingCity: payload.shippingCity,
        shippingState: payload.shippingState,
        shippingZip: payload.shippingZip,
        paymentStatus: "pending",
        amountPaidCents: 0,
        subtotalCents,
        shippingCents: ship.shippingCents,
        itemCount: payload.items.reduce((sum, i) => sum + i.quantity, 0),
      });

      // Snapshot each line item.
      await storage.createOrderItems(itemsResolved.map(({ item, product }) => ({
        orderId: order.id,
        productId: product.id,
        productName: product.name,
        productSlug: product.slug,
        size: item.size || null,
        quantity: item.quantity,
        unitPriceCents: product.priceCents,
        category: product.category,
      })));

      const baseUrl = process.env.APP_BASE_URL || `${req.protocol}://${req.get("host")}`;

      if (STRIPE_MODE === "preview") {
        const { db } = await import("./storage");
        const { orders } = await import("@shared/schema");
        const { eq } = await import("drizzle-orm");
        const fakeSession = `preview_cart_${order.id}_${Date.now()}`;
        await db.update(orders)
          .set({ stripeSessionId: fakeSession, paymentStatus: "preview", amountPaidCents: subtotalCents + ship.shippingCents })
          .where(eq(orders.id, order.id));
        return res.json({ orderId: order.id, checkoutUrl: `${baseUrl}/#/thanks?type=merch&id=${order.id}&preview=1`, previewMode: true });
      }

      // Build Stripe line items with a flat key-value scheme.
      const params: Record<string, any> = {
        mode: "payment",
        "payment_method_types[0]": "card",
        customer_email: payload.email,
        "shipping_address_collection[allowed_countries][0]": "US",
        "shipping_options[0][shipping_rate_data][type]": "fixed_amount",
        "shipping_options[0][shipping_rate_data][display_name]": ship.label,
        "shipping_options[0][shipping_rate_data][fixed_amount][amount]": ship.shippingCents,
        "shipping_options[0][shipping_rate_data][fixed_amount][currency]": "usd",
        "shipping_options[0][shipping_rate_data][delivery_estimate][minimum][unit]": "business_day",
        "shipping_options[0][shipping_rate_data][delivery_estimate][minimum][value]": ship.etaMin,
        "shipping_options[0][shipping_rate_data][delivery_estimate][maximum][unit]": "business_day",
        "shipping_options[0][shipping_rate_data][delivery_estimate][maximum][value]": ship.etaMax,
        "metadata[order_id]": order.id,
        "metadata[kind]": "merch_cart",
        "metadata[shipping_cents]": ship.shippingCents,
        "metadata[item_count]": payload.items.reduce((s, i) => s + i.quantity, 0),
        success_url: `${baseUrl}/#/thanks?type=merch&id=${order.id}`,
        cancel_url: `${baseUrl}/#/cart?canceled=1`,
      };
      itemsResolved.forEach(({ item, product }, idx) => {
        const sizeSuffix = item.size ? ` (${item.size})` : "";
        params[`line_items[${idx}][price_data][currency]`] = "usd";
        params[`line_items[${idx}][price_data][unit_amount]`] = product.priceCents;
        params[`line_items[${idx}][price_data][product_data][name]`] = `${product.name}${sizeSuffix}`;
        params[`line_items[${idx}][price_data][product_data][description]`] = product.description.substring(0, 200);
        params[`line_items[${idx}][quantity]`] = item.quantity;
      });

      const session = await stripeCall("/checkout/sessions", params);

      const { db } = await import("./storage");
      const { orders } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      await db.update(orders).set({ stripeSessionId: session.id }).where(eq(orders.id, order.id));

      res.json({ orderId: order.id, checkoutUrl: session.url });
    } catch (err) {
      // On any failure past reservation, best-effort release so stock isn't leaked.
      // (The specific reservations aren't tracked outside the try scope, so this catch
      // relies on the inner rollback above for validation-time failures. Stripe-call
      // failures here leave stock reserved on the order row — an admin can restock manually.)
      if (err instanceof z.ZodError) return res.status(400).json({ message: "Invalid cart", errors: err.issues });
      next(err);
    }
  });

  // Public order lookup for the thanks page: returns the order + its line items.
  app.get("/api/orders/:id", async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid order id" });
    const order = await storage.getOrderById(id);
    if (!order) return res.status(404).json({ message: "Order not found" });
    const items = await storage.listOrderItems(id);
    // Redact PII except first name + first initial. Everything else is safe totals/items.
    res.json({
      id: order.id,
      firstName: order.firstName,
      lastNameInitial: order.lastName ? order.lastName.charAt(0) : "",
      subtotalCents: order.subtotalCents,
      shippingCents: order.shippingCents,
      amountPaidCents: order.amountPaidCents,
      itemCount: order.itemCount,
      paymentStatus: order.paymentStatus,
      createdAt: order.createdAt,
      // Legacy single-item fallback (before cart)
      legacyProductId: order.productId,
      legacySize: order.size,
      items: items.map(i => ({
        productName: i.productName, productSlug: i.productSlug, size: i.size,
        quantity: i.quantity, unitPriceCents: i.unitPriceCents,
      })),
    });
  });

  // ============ STRIPE WEBHOOK ============
  // In production (STRIPE_WEBHOOK_SECRET set), verify the Stripe-Signature header
  // against the raw request body using HMAC-SHA256 (Stripe's v1 signing scheme).
  // In preview / dev mode with no secret, accept unsigned payloads for testing.
  app.post("/api/stripe/webhook", async (req, res) => {
    try {
      const secret = process.env.STRIPE_WEBHOOK_SECRET;
      let event: any = req.body;

      if (secret) {
        const sigHeader = req.header("stripe-signature") || "";
        const raw = (req as any).rawBody as Buffer | undefined;
        if (!raw) {
          console.error("webhook: missing raw body");
          return res.status(400).send("missing raw body");
        }
        // Parse t=... and v1=... pairs from the Stripe-Signature header
        const parts = sigHeader.split(",").map((p) => p.trim().split("="));
        const t = parts.find(([k]) => k === "t")?.[1];
        const sigs = parts.filter(([k]) => k === "v1").map(([, v]) => v);
        if (!t || sigs.length === 0) {
          console.error("webhook: malformed signature header");
          return res.status(400).send("malformed signature");
        }
        // Reject events older than 5 minutes (Stripe recommended tolerance)
        const nowSec = Math.floor(Date.now() / 1000);
        if (Math.abs(nowSec - parseInt(t, 10)) > 300) {
          console.error("webhook: timestamp outside tolerance");
          return res.status(400).send("timestamp outside tolerance");
        }
        const crypto = await import("node:crypto");
        const signedPayload = `${t}.${raw.toString("utf8")}`;
        const expected = crypto.createHmac("sha256", secret).update(signedPayload).digest("hex");
        const expectedBuf = Buffer.from(expected, "hex");
        const valid = sigs.some((s) => {
          try {
            const sBuf = Buffer.from(s, "hex");
            return sBuf.length === expectedBuf.length && crypto.timingSafeEqual(sBuf, expectedBuf);
          } catch {
            return false;
          }
        });
        if (!valid) {
          console.error("webhook: invalid signature");
          return res.status(400).send("invalid signature");
        }
        // Signature verified — parse the raw body as our trusted event object
        try {
          event = JSON.parse(raw.toString("utf8"));
        } catch {
          return res.status(400).send("invalid json");
        }
      }

      if (event?.type === "checkout.session.completed") {
        const s = event.data.object;
        const kind = s.metadata?.kind;
        if (kind === "registration") {
          const reg = await storage.updateRegistrationBySession(s.id, {
            paymentStatus: "paid",
            amountPaidCents: s.amount_total || 0,
            stripePaymentIntentId: s.payment_intent || null,
          });
          if (reg) await issueTicketAndEmail(reg.id).catch(e => console.error("[tickets] issue failed", e));
        } else if (kind === "merch" || kind === "merch_cart") {
          await storage.updateOrderBySession(s.id, {
            paymentStatus: "paid",
            amountPaidCents: s.amount_total || 0,
            stripePaymentIntentId: s.payment_intent || null,
          });
          // Stock was already reserved at cart-checkout — nothing to do.
        }
      }

      // Release reserved stock if the customer never completes checkout.
      if (event?.type === "checkout.session.expired" || event?.type === "checkout.session.async_payment_failed") {
        const s = event.data.object;
        const kind = s.metadata?.kind;
        if (kind === "merch_cart" || kind === "merch") {
          const order = await storage.updateOrderBySession(s.id, { paymentStatus: "expired" });
          if (order) {
            const items = await storage.listOrderItems(order.id);
            if (items.length > 0) {
              for (const it of items) {
                await storage.releaseStock(it.productId, it.size, it.quantity);
              }
            } else if (order.productId) {
              // Legacy single-item order.
              await storage.releaseStock(order.productId, order.size, 1);
            }
            console.log(`[stock] Released reservation for expired order ${order.id}`);
          }
        }
      }
      res.json({ received: true });
    } catch (err) {
      console.error("webhook error", err);
      res.status(200).json({ received: true }); // always ack to prevent Stripe retries in dev
    }
  });

  // ============ TICKET FETCH FOR THANKS PAGE ============
  // Public: returns minimal info about a registration by id so the thanks page can render its QR.
  // In preview mode a code is issued on demand for demo UX.
  app.get("/api/registration/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ message: "bad id" });
      let reg = await storage.getRegistrationById(id);
      if (!reg) return res.status(404).json({ message: "not found" });
      // Issue a code if payment succeeded (or preview) but code not yet set.
      if (!reg.confirmationCode && (reg.paymentStatus === "paid" || reg.paymentStatus === "preview")) {
        await ensureConfirmationCode(reg);
        reg = await storage.getRegistrationById(id);
      }
      const event = await storage.getEventById(reg!.eventId);
      res.json({
        id: reg!.id,
        firstName: reg!.firstName,
        lastName: reg!.lastName,
        ticketType: reg!.ticketType,
        paymentStatus: reg!.paymentStatus,
        confirmationCode: reg!.confirmationCode,
        checkedInAt: reg!.checkedInAt,
        event: event ? { title: event.title, subtitle: event.subtitle, startsAt: event.startsAt, endsAt: event.endsAt, location: event.location, venue: event.venue } : null,
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "error" });
    }
  });

  // Public: raw QR PNG for a given confirmation code (safe: knowing the code IS the ticket)
  app.get("/api/ticket-qr/:code.png", async (req, res) => {
    try {
      const code = req.params.code;
      const reg = await storage.getRegistrationByConfirmationCode(code);
      if (!reg) return res.status(404).send("not found");
      const baseUrl = process.env.APP_BASE_URL || `${req.protocol}://${req.get("host")}`;
      const png = await ticketQrPng(code, baseUrl);
      res.setHeader("Content-Type", "image/png");
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.send(png);
    } catch (err) {
      console.error(err);
      res.status(500).send("error");
    }
  });

  // Internal helper: called by webhook + verify handlers when a registration flips to paid.
  async function issueTicketAndEmail(registrationId: number) {
    const reg = await storage.getRegistrationById(registrationId);
    if (!reg) return;
    const code = await ensureConfirmationCode(reg);
    const event = await storage.getEventById(reg.eventId);
    if (!event) return;
    const baseUrl = process.env.APP_BASE_URL || "https://chaoscartel.net";
    const eventDate = new Date(event.startsAt * 1000).toLocaleString("en-US", {
      weekday: "long", month: "long", day: "numeric", year: "numeric",
      hour: "numeric", minute: "2-digit", timeZone: "America/New_York", timeZoneName: "short",
    });
    await sendConfirmationEmail({
      to: reg.email,
      firstName: reg.firstName,
      lastName: reg.lastName,
      ticketType: reg.ticketType,
      eventTitle: event.title,
      eventSubtitle: event.subtitle,
      eventDate,
      eventLocation: `${event.venue ? event.venue + " \u2014 " : ""}${event.location}`,
      code,
      baseUrl,
      // Pricing breakdown for drivers with crew add-ons
      basePriceCents: event.driverPriceCents,
      crewMemberName: (reg as any).crewMemberName || null,
      extraSpectators: (reg as any).extraSpectators || 0,
      extraSpectatorPriceCents: event.spectatorPriceCents,
      extraRideAlongs: (reg as any).extraRideAlongs || 0,
      extraRideAlongPriceCents: event.rideAlongPriceCents,
      totalPaidCents: reg.amountPaidCents,
    });
  }

  // ============ POLL: verify a session after redirect (fallback for no-webhook dev) ============
  app.get("/api/verify/:sessionId", async (req, res, next) => {
    try {
      const sid = req.params.sessionId;
      if (STRIPE_MODE === "preview" || sid.startsWith("preview_")) {
        return res.json({ paymentStatus: "preview", previewMode: true });
      }
      const s = await stripeCall(`/checkout/sessions/${sid}`);
      const kind = s.metadata?.kind;
      if (s.payment_status === "paid") {
        if (kind === "registration") {
          const reg = await storage.updateRegistrationBySession(s.id, {
            paymentStatus: "paid",
            amountPaidCents: s.amount_total || 0,
            stripePaymentIntentId: s.payment_intent || null,
          });
          if (reg) await issueTicketAndEmail(reg.id).catch(e => console.error("[tickets] issue failed", e));
        } else if (kind === "merch") {
          await storage.updateOrderBySession(s.id, {
            paymentStatus: "paid",
            amountPaidCents: s.amount_total || 0,
            stripePaymentIntentId: s.payment_intent || null,
          });
        }
      }
      res.json({ status: s.payment_status, kind });
    } catch (err) { next(err); }
  });

  // ============ ADMIN AUTH ============
  app.post("/api/admin/login", async (req, res) => {
    const schema = z.object({ username: z.string(), password: z.string() });
    const { username, password } = schema.parse(req.body);
    const user = await storage.getUserByUsername(username);
    if (!user || user.password !== password) {
      return res.status(401).json({ message: "Invalid credentials" });
    }
    if (!user.isAdmin) return res.status(403).json({ message: "Not an admin" });
    req.session.userId = user.id;
    req.session.isAdmin = true;
    res.json({ ok: true, username: user.username });
  });
  app.post("/api/admin/logout", (req, res) => {
    req.session.destroy(() => res.json({ ok: true }));
  });
  app.get("/api/admin/me", (req, res) => {
    if (!req.session?.isAdmin) return res.json({ isAdmin: false });
    res.json({ isAdmin: true, userId: req.session.userId });
  });

  // ============ ADMIN CRUD ============
  app.get("/api/admin/registrations", requireAdmin, async (req, res) => {
    const eventId = req.query.eventId ? Number(req.query.eventId) : undefined;
    res.json(await storage.listRegistrations(eventId));
  });
  app.get("/api/admin/orders", requireAdmin, async (_req, res) => {
    const orders = await storage.listOrders();
    // Enrich each order with its line items so the admin table can render multi-item orders.
    const enriched = await Promise.all(orders.map(async (o) => {
      const items = await storage.listOrderItems(o.id);
      return { ...o, items };
    }));
    res.json(enriched);
  });
  app.get("/api/admin/export/registrations.csv", requireAdmin, async (req, res) => {
    const eventId = req.query.eventId ? Number(req.query.eventId) : undefined;
    const rows = await storage.listRegistrations(eventId);
    const headers = [
      "id","event_id","ticket_type","first_name","last_name","email","phone",
      "car","experience","crew_member_name","extra_spectators","extra_ride_alongs","waiver_signed","waiver_signature","amount_paid_cents",
      "payment_status","created_at",
    ];
    const csv = [
      headers.join(","),
      ...rows.map(r => [
        r.id,
        r.eventId,
        r.ticketType,
        r.firstName,
        r.lastName,
        r.email,
        r.phone,
        `"${[r.carYear, r.carMake, r.carModel, r.carColor].filter(Boolean).join(" ")}"`,
        r.experienceLevel || "",
        `"${(r as any).crewMemberName || ""}"`,
        (r as any).extraSpectators || 0,
        (r as any).extraRideAlongs || 0,
        r.waiverSigned ? "yes" : "no",
        `"${r.waiverSignatureName || ""}"`,
        r.amountPaidCents,
        r.paymentStatus,
        new Date(r.createdAt * 1000).toISOString(),
      ].join(",")),
    ].join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="registrations-${Date.now()}.csv"`);
    res.send(csv);
  });

  app.get("/api/admin/events", requireAdmin, async (_req, res) => {
    res.json(await storage.listEvents());
  });
  app.get("/api/admin/products", requireAdmin, async (_req, res) => {
    res.json(await storage.listProducts());
  });
  app.get("/api/admin/crew", requireAdmin, async (_req, res) => {
    res.json(await storage.listCrew());
  });

  app.post("/api/admin/events", requireAdmin, async (req, res, next) => {
    try {
      const data = insertEventSchema.parse(req.body);
      res.json(await storage.createEvent(data));
    } catch (err) { next(err); }
  });
  app.patch("/api/admin/events/:id", requireAdmin, async (req, res, next) => {
    try {
      const data = insertEventSchema.partial().parse(req.body);
      const evt = await storage.updateEvent(Number(req.params.id), data);
      if (!evt) return res.status(404).json({ message: "Not found" });
      res.json(evt);
    } catch (err) { next(err); }
  });
  app.delete("/api/admin/events/:id", requireAdmin, async (req, res) => {
    const ok = await storage.deleteEvent(Number(req.params.id));
    res.json({ ok });
  });

  app.post("/api/admin/products", requireAdmin, async (req, res, next) => {
    try {
      const data = insertProductSchema.parse(req.body);
      res.json(await storage.createProduct(data));
    } catch (err) { next(err); }
  });
  app.patch("/api/admin/products/:id", requireAdmin, async (req, res, next) => {
    try {
      const data = insertProductSchema.partial().parse(req.body);
      const p = await storage.updateProduct(Number(req.params.id), data);
      if (!p) return res.status(404).json({ message: "Not found" });
      res.json(p);
    } catch (err) { next(err); }
  });
  app.delete("/api/admin/products/:id", requireAdmin, async (req, res) => {
    const ok = await storage.deleteProduct(Number(req.params.id));
    res.json({ ok });
  });

  // Admin: stock management. Variants scoped to a product.
  app.get("/api/admin/products/:id/variants", requireAdmin, async (req, res) => {
    const variants = await storage.listVariants(Number(req.params.id));
    res.json(variants);
  });
  app.patch("/api/admin/variants/:id", requireAdmin, async (req, res, next) => {
    try {
      const { quantity, unlimitedStock } = req.body as { quantity?: number; unlimitedStock?: boolean };
      if (quantity === undefined || quantity < 0 || !Number.isFinite(quantity)) {
        return res.status(400).json({ message: "quantity (≥0) is required" });
      }
      const updated = await storage.updateVariantQuantity(Number(req.params.id), Math.floor(quantity), unlimitedStock);
      if (!updated) return res.status(404).json({ message: "Variant not found" });
      res.json(updated);
    } catch (err) { next(err); }
  });

  app.post("/api/admin/crew", requireAdmin, async (req, res, next) => {
    try {
      const data = insertCrewSchema.parse(req.body);
      res.json(await storage.createCrewMember(data));
    } catch (err) { next(err); }
  });
  app.patch("/api/admin/crew/:id", requireAdmin, async (req, res, next) => {
    try {
      const data = insertCrewSchema.partial().parse(req.body);
      const c = await storage.updateCrewMember(Number(req.params.id), data);
      if (!c) return res.status(404).json({ message: "Not found" });
      res.json(c);
    } catch (err) { next(err); }
  });
  app.delete("/api/admin/crew/:id", requireAdmin, async (req, res) => {
    const ok = await storage.deleteCrewMember(Number(req.params.id));
    res.json({ ok });
  });

  // ============ ADMIN: CHECK-IN + ROSTER ============
  // Live roster for one event (admin)
  app.get("/api/admin/roster/:eventId", requireAdmin, async (req, res) => {
    const eventId = Number(req.params.eventId);
    const event = await storage.getEventById(eventId);
    if (!event) return res.status(404).json({ message: "Event not found" });
    const regs = await storage.listRegistrations(eventId);
    const paid = regs.filter(r => r.paymentStatus === "paid" || r.paymentStatus === "preview");
    const summary = {
      drivers: paid.filter(r => r.ticketType === "driver"),
      rideAlongs: paid.filter(r => r.ticketType === "ride_along"),
      spectators: paid.filter(r => r.ticketType === "spectator"),
    };
    res.json({
      event: { id: event.id, title: event.title, subtitle: event.subtitle, startsAt: event.startsAt, location: event.location, venue: event.venue },
      totals: {
        drivers: summary.drivers.length,
        rideAlongs: summary.rideAlongs.length,
        spectators: summary.spectators.length,
        total: paid.length,
        checkedIn: paid.filter(r => r.checkedInAt).length,
      },
      registrations: paid.map(r => ({
        id: r.id, firstName: r.firstName, lastName: r.lastName, phone: r.phone, email: r.email,
        ticketType: r.ticketType,
        car: [r.carYear, r.carMake, r.carModel].filter(Boolean).join(" ") || null,
        confirmationCode: r.confirmationCode,
        checkedInAt: r.checkedInAt,
        checkedInBy: r.checkedInBy,
      })),
    });
  });

  // Roster PDF export (with tear-off QR labels)
  app.get("/api/admin/roster/:eventId/pdf", requireAdmin, async (req, res) => {
    try {
      const eventId = Number(req.params.eventId);
      const event = await storage.getEventById(eventId);
      if (!event) return res.status(404).json({ message: "Event not found" });
      const allRegs = await storage.listRegistrations(eventId);
      const paid = allRegs.filter(r => r.paymentStatus === "paid" || r.paymentStatus === "preview");
      // Ensure every paid reg has a confirmation code (issue if missing)
      for (const r of paid) {
        if (!r.confirmationCode) await ensureConfirmationCode(r);
      }
      const refreshed = await storage.listRegistrations(eventId);
      const paidRefreshed = refreshed.filter(r => r.paymentStatus === "paid" || r.paymentStatus === "preview");
      const baseUrl = process.env.APP_BASE_URL || `${req.protocol}://${req.get("host")}`;
      const pdf = await generateRosterPdf({
        event: { title: event.title, subtitle: event.subtitle, startsAt: event.startsAt, location: event.location, venue: event.venue },
        registrations: paidRefreshed,
        baseUrl,
      });
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="roster-${event.slug}-${Date.now()}.pdf"`);
      res.send(pdf);
    } catch (err) {
      console.error("[roster pdf] error", err);
      res.status(500).json({ message: "pdf generation failed" });
    }
  });

  // Look up a code (used by scanner to preview before committing check-in)
  app.get("/api/admin/checkin/:code", requireAdmin, async (req, res) => {
    const code = req.params.code.trim().toUpperCase();
    const reg = await storage.getRegistrationByConfirmationCode(code);
    if (!reg) return res.status(404).json({ message: "Ticket not found" });
    const event = await storage.getEventById(reg.eventId);
    res.json({
      registration: {
        id: reg.id, firstName: reg.firstName, lastName: reg.lastName,
        ticketType: reg.ticketType, paymentStatus: reg.paymentStatus,
        confirmationCode: reg.confirmationCode,
        car: [reg.carYear, reg.carMake, reg.carModel].filter(Boolean).join(" ") || null,
        checkedInAt: reg.checkedInAt, checkedInBy: reg.checkedInBy,
      },
      event: event ? { id: event.id, title: event.title, subtitle: event.subtitle } : null,
    });
  });

  // Actually mark a ticket checked in
  app.post("/api/admin/checkin/:code", requireAdmin, async (req, res) => {
    const code = req.params.code.trim().toUpperCase();
    const reg = await storage.getRegistrationByConfirmationCode(code);
    if (!reg) return res.status(404).json({ ok: false, reason: "not_found", message: "Ticket not found" });
    if (reg.paymentStatus !== "paid" && reg.paymentStatus !== "preview") {
      return res.status(400).json({ ok: false, reason: "unpaid", message: "Ticket not paid" });
    }
    if (reg.checkedInAt) {
      return res.json({
        ok: false, reason: "already_checked_in",
        message: "Already checked in",
        checkedInAt: reg.checkedInAt, checkedInBy: reg.checkedInBy,
        registration: { id: reg.id, firstName: reg.firstName, lastName: reg.lastName, ticketType: reg.ticketType },
      });
    }
    const now = Math.floor(Date.now() / 1000);
    const adminName = (req.session as any)?.username || "admin";
    const updated = await storage.updateRegistrationById(reg.id, { checkedInAt: now, checkedInBy: adminName });
    res.json({
      ok: true,
      message: "Checked in",
      registration: { id: updated!.id, firstName: updated!.firstName, lastName: updated!.lastName, ticketType: updated!.ticketType, checkedInAt: updated!.checkedInAt },
    });
  });

  // Undo check-in
  app.post("/api/admin/checkin/:code/undo", requireAdmin, async (req, res) => {
    const code = req.params.code.trim().toUpperCase();
    const reg = await storage.getRegistrationByConfirmationCode(code);
    if (!reg) return res.status(404).json({ ok: false, message: "Ticket not found" });
    await storage.updateRegistrationById(reg.id, { checkedInAt: null as any, checkedInBy: null as any });
    res.json({ ok: true });
  });

  return httpServer;
}
