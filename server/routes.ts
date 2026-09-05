import type { Express, Request, Response, NextFunction } from "express";
import type { Server } from 'node:http';
import session from 'express-session';
import MemoryStore from 'memorystore';
import { storage } from "./storage";
import {
  bookingPayloadSchema,
  merchOrderPayloadSchema,
  insertEventSchema,
  insertProductSchema,
  insertCrewSchema,
} from "@shared/schema";
import { z } from "zod";

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
    res.json(products);
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

      // Capacity check
      let priceCents = 0;
      let itemName = "";
      if (payload.ticketType === "driver") {
        if (event.driverRemaining <= 0) return res.status(400).json({ message: "Driver spots sold out" });
        if (!payload.techInspection || !payload.experienceLevel || !payload.carMake) {
          return res.status(400).json({ message: "Driver registration requires car details, tech inspection, and experience level" });
        }
        priceCents = event.driverPriceCents;
        itemName = `${event.title} — Driver Entry`;
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
        const session = await stripeCall("/checkout/sessions", {
          mode: "payment",
          "payment_method_types[0]": "card",
          "line_items[0][price_data][currency]": "usd",
          "line_items[0][price_data][unit_amount]": priceCents,
          "line_items[0][price_data][product_data][name]": itemName,
          "line_items[0][price_data][product_data][description]": `${payload.firstName} ${payload.lastName} — ${event.location}`,
          "line_items[0][quantity]": 1,
          customer_email: payload.email,
          "metadata[registration_id]": reg.id,
          "metadata[event_id]": event.id,
          "metadata[ticket_type]": payload.ticketType,
          "metadata[kind]": "registration",
          success_url: `${baseUrl}/#/thanks?type=registration&id=${reg.id}`,
          cancel_url: `${baseUrl}/#/sessions/${event.slug}?canceled=1`,
          payment_intent_data: {
            "metadata[registration_id]": reg.id,
          },
        });
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
      if (STRIPE_MODE === "preview") {
        const { db } = await import("./storage");
        const { orders } = await import("@shared/schema");
        const { eq } = await import("drizzle-orm");
        const fakeSession = `preview_order_${order.id}_${Date.now()}`;
        await db.update(orders)
          .set({ stripeSessionId: fakeSession, paymentStatus: "preview", amountPaidCents: product.priceCents })
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
        "metadata[order_id]": order.id,
        "metadata[kind]": "merch",
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
          await storage.updateRegistrationBySession(s.id, {
            paymentStatus: "paid",
            amountPaidCents: s.amount_total || 0,
            stripePaymentIntentId: s.payment_intent || null,
          });
        } else if (kind === "merch") {
          await storage.updateOrderBySession(s.id, {
            paymentStatus: "paid",
            amountPaidCents: s.amount_total || 0,
            stripePaymentIntentId: s.payment_intent || null,
          });
        }
      }
      res.json({ received: true });
    } catch (err) {
      console.error("webhook error", err);
      res.status(200).json({ received: true }); // always ack to prevent Stripe retries in dev
    }
  });

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
          await storage.updateRegistrationBySession(s.id, {
            paymentStatus: "paid",
            amountPaidCents: s.amount_total || 0,
            stripePaymentIntentId: s.payment_intent || null,
          });
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
    res.json(await storage.listOrders());
  });
  app.get("/api/admin/export/registrations.csv", requireAdmin, async (req, res) => {
    const eventId = req.query.eventId ? Number(req.query.eventId) : undefined;
    const rows = await storage.listRegistrations(eventId);
    const headers = [
      "id","event_id","ticket_type","first_name","last_name","email","phone",
      "car","experience","waiver_signed","waiver_signature","amount_paid_cents",
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

  return httpServer;
}
