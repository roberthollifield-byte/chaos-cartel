// Ticket helpers: confirmation codes, QR generation, confirmation email, roster PDF.
import crypto from "node:crypto";
import QRCode from "qrcode";
import PDFDocument from "pdfkit";
import { storage } from "./storage";
import type { Registration } from "@shared/schema";

// Confirmation code format: CC-XXXX-YYYY (base32, no ambiguous chars)
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I/L

export function generateConfirmationCode(): string {
  const rand = crypto.randomBytes(8);
  const pick = (i: number) => CODE_ALPHABET[rand[i] % CODE_ALPHABET.length];
  return `CC-${pick(0)}${pick(1)}${pick(2)}${pick(3)}-${pick(4)}${pick(5)}${pick(6)}${pick(7)}`;
}

// Ensure a registration has a unique confirmation code; return it.
// Idempotent: if the row already has one, return it unchanged.
export async function ensureConfirmationCode(reg: Registration): Promise<string> {
  if (reg.confirmationCode) return reg.confirmationCode;
  // Try up to 5 times in case of unlikely collision
  for (let i = 0; i < 5; i++) {
    const code = generateConfirmationCode();
    const existing = await storage.getRegistrationByConfirmationCode(code);
    if (existing) continue;
    const updated = await storage.updateRegistrationById(reg.id, { confirmationCode: code });
    if (updated?.confirmationCode) return updated.confirmationCode;
  }
  throw new Error("Failed to generate unique confirmation code");
}

// QR PNG buffer for the check-in URL
export async function ticketQrPng(code: string, baseUrl: string): Promise<Buffer> {
  const url = `${baseUrl}/#/admin/checkin?code=${encodeURIComponent(code)}`;
  return QRCode.toBuffer(url, { errorCorrectionLevel: "M", margin: 2, width: 512 });
}

export async function ticketQrDataUrl(code: string, baseUrl: string): Promise<string> {
  const url = `${baseUrl}/#/admin/checkin?code=${encodeURIComponent(code)}`;
  return QRCode.toDataURL(url, { errorCorrectionLevel: "M", margin: 2, width: 512 });
}

// ============ CONFIRMATION EMAIL (Resend) ============
// If RESEND_API_KEY is not set, this is a silent no-op so the flow doesn't break.
export async function sendConfirmationEmail(opts: {
  to: string;
  firstName: string;
  lastName: string;
  ticketType: string;
  eventTitle: string;
  eventSubtitle: string | null;
  eventDate: string;
  eventLocation: string;
  code: string;
  baseUrl: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log(`[email] RESEND_API_KEY not set — skipping confirmation email to ${opts.to} (code ${opts.code})`);
    return { skipped: true };
  }
  const from = process.env.RESEND_FROM || "Chaos Cartel <tickets@chaoscartel.net>";
  try {
    const qrDataUrl = await ticketQrDataUrl(opts.code, opts.baseUrl);
    const ticketLabel = opts.ticketType === "ride_along" ? "RIDE-ALONG" : opts.ticketType.toUpperCase();
    const html = confirmationEmailHtml({ ...opts, qrDataUrl, ticketLabel });
    // Embed QR as inline attachment (CID) for robust client rendering
    const qrPng = await ticketQrPng(opts.code, opts.baseUrl);
    const body = {
      from,
      to: [opts.to],
      subject: `Your Chaos Cartel ticket — ${opts.eventTitle}`,
      html,
      attachments: [
        {
          filename: `chaos-cartel-ticket-${opts.code}.png`,
          content: qrPng.toString("base64"),
        },
      ],
    };
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error(`[email] Resend send failed ${res.status}: ${text}`);
      return { sent: false, error: text };
    }
    return { sent: true };
  } catch (err: any) {
    console.error("[email] send error:", err?.message || err);
    return { sent: false, error: String(err?.message || err) };
  }
}

function confirmationEmailHtml(o: {
  firstName: string;
  lastName: string;
  ticketLabel: string;
  eventTitle: string;
  eventSubtitle: string | null;
  eventDate: string;
  eventLocation: string;
  code: string;
  qrDataUrl: string;
}) {
  return `<!doctype html>
<html>
<body style="margin:0;padding:0;background:#0a0a0a;color:#e6e6e6;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px;">
    <div style="text-align:center;padding:8px 0 24px;">
      <div style="font-size:12px;letter-spacing:3px;color:#00ffa3;font-family:monospace;">// CHAOS CARTEL</div>
      <div style="font-size:11px;letter-spacing:2px;color:#888;font-family:monospace;margin-top:4px;">// TICKET CONFIRMED</div>
    </div>
    <h1 style="color:#00ffa3;font-size:32px;font-weight:900;font-style:italic;margin:0 0 8px;text-align:center;">SEE YOU AT THE TRACK</h1>
    <p style="color:#ccc;font-size:15px;line-height:1.5;text-align:center;margin:0 0 24px;">Hey ${escapeHtml(o.firstName)} — your ${o.ticketLabel} entry is locked in.</p>

    <div style="background:#111;border:1px solid #222;border-radius:12px;padding:24px;margin:0 0 24px;">
      <div style="font-family:monospace;font-size:11px;letter-spacing:2px;color:#ff2eb8;margin-bottom:12px;">// EVENT</div>
      <div style="font-size:22px;font-weight:800;color:#fff;">${escapeHtml(o.eventTitle)}</div>
      ${o.eventSubtitle ? `<div style="font-size:16px;color:#00ffa3;font-style:italic;margin-top:4px;">${escapeHtml(o.eventSubtitle)}</div>` : ""}
      <div style="font-size:14px;color:#bbb;margin-top:16px;">${escapeHtml(o.eventDate)}</div>
      <div style="font-size:14px;color:#bbb;">${escapeHtml(o.eventLocation)}</div>
      <div style="margin-top:16px;padding-top:16px;border-top:1px solid #222;">
        <div style="font-family:monospace;font-size:11px;letter-spacing:2px;color:#00e5ff;margin-bottom:4px;">// TICKET TYPE</div>
        <div style="font-size:16px;font-weight:700;color:#fff;">${o.ticketLabel}</div>
      </div>
    </div>

    <div style="background:#fff;border-radius:12px;padding:20px;text-align:center;margin:0 0 16px;">
      <div style="font-family:monospace;font-size:11px;letter-spacing:2px;color:#000;margin-bottom:12px;">// SHOW AT GATE</div>
      <img src="${o.qrDataUrl}" alt="Ticket QR code" style="display:block;margin:0 auto;width:220px;height:220px;" />
      <div style="font-family:monospace;font-size:14px;letter-spacing:2px;color:#000;margin-top:12px;font-weight:700;">${o.code}</div>
    </div>

    <p style="color:#aaa;font-size:13px;line-height:1.6;text-align:center;margin:24px 0 0;">
      Save this email or screenshot the QR — that's your ticket. If you lose it, reply to this email with your name and we'll resend.
    </p>
    <p style="color:#666;font-size:12px;text-align:center;margin:24px 0 0;">chaoscartel.net</p>
  </div>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

// ============ ROSTER PDF WITH TEAR-OFF QR LABELS ============
export async function generateRosterPdf(opts: {
  event: {
    title: string;
    subtitle: string | null;
    startsAt: number;
    location: string;
    venue: string | null;
  };
  registrations: Registration[];
  baseUrl: string;
}): Promise<Buffer> {
  const { event, registrations, baseUrl } = opts;

  // Pre-generate QR data URLs so we don't await inside pdf callbacks
  const qrs: Record<string, string> = {};
  for (const r of registrations) {
    if (r.confirmationCode) {
      qrs[r.confirmationCode] = await ticketQrDataUrl(r.confirmationCode, baseUrl);
    }
  }

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "LETTER", margin: 36 });
      const chunks: Buffer[] = [];
      doc.on("data", (c) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      // ============ PAGE 1: ROSTER SUMMARY ============
      const dateStr = new Date(event.startsAt * 1000).toLocaleString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZone: "America/New_York",
        timeZoneName: "short",
      });
      doc.fontSize(10).fillColor("#666").text("CHAOS CARTEL", { align: "left" });
      doc.moveDown(0.2);
      doc.fontSize(24).fillColor("#000").text(event.title, { continued: false });
      if (event.subtitle) {
        doc.fontSize(14).fillColor("#666").text(event.subtitle);
      }
      doc.fontSize(11).fillColor("#333").text(dateStr);
      doc.text(`${event.venue ? event.venue + " — " : ""}${event.location}`);
      doc.moveDown(0.5);

      const drivers = registrations.filter((r) => r.ticketType === "driver");
      const riders = registrations.filter((r) => r.ticketType === "ride_along");
      const spectators = registrations.filter((r) => r.ticketType === "spectator");

      doc.fontSize(10).fillColor("#000");
      doc.text(`Drivers: ${drivers.length}   Ride-alongs: ${riders.length}   Spectators: ${spectators.length}   Total: ${registrations.length}`);
      doc.moveDown(0.8);

      const renderSection = (title: string, list: Registration[]) => {
        if (list.length === 0) return;
        doc.fontSize(13).fillColor("#000").text(title.toUpperCase(), { underline: true });
        doc.moveDown(0.3);
        doc.fontSize(9).fillColor("#000");
        // Header row
        const cols = { name: 40, phone: 240, code: 360, status: 480 };
        doc.font("Helvetica-Bold");
        const headerY = doc.y;
        doc.text("NAME", cols.name, headerY, { width: 190 });
        doc.text("PHONE", cols.phone, headerY, { width: 110 });
        doc.text("CODE", cols.code, headerY, { width: 110 });
        doc.text("STATUS", cols.status, headerY, { width: 100 });
        doc.font("Helvetica");
        doc.moveDown(0.4);
        doc.moveTo(36, doc.y).lineTo(576, doc.y).strokeColor("#ccc").stroke();
        doc.moveDown(0.3);
        for (const r of list) {
          if (doc.y > 720) doc.addPage();
          const y = doc.y;
          const carLine = r.carYear || r.carMake ? `  (${[r.carYear, r.carMake, r.carModel].filter(Boolean).join(" ")})` : "";
          doc.text(`${r.firstName} ${r.lastName}${carLine}`, cols.name, y, { width: 190 });
          doc.text(r.phone || "", cols.phone, y, { width: 110 });
          doc.text(r.confirmationCode || "—", cols.code, y, { width: 110 });
          const status = r.checkedInAt ? "CHECKED IN" : r.paymentStatus === "paid" ? "paid" : r.paymentStatus;
          doc.fillColor(r.checkedInAt ? "#00994d" : r.paymentStatus === "paid" ? "#000" : "#c00");
          doc.text(status, cols.status, y, { width: 100 });
          doc.fillColor("#000");
          doc.moveDown(0.4);
        }
        doc.moveDown(0.8);
      };
      renderSection("Drivers", drivers);
      renderSection("Ride-Alongs", riders);
      renderSection("Spectators", spectators);

      // ============ TEAR-OFF QR LABELS ============
      // 4 columns × 5 rows per Letter page = 20 labels/page
      // Each label ~ 135pt wide × 135pt tall, includes QR + name + type
      doc.addPage();
      doc.fontSize(10).fillColor("#666").text("CHAOS CARTEL — TEAR-OFF WRISTBAND / PIT PASS LABELS", { align: "center" });
      doc.fontSize(9).fillColor("#666").text(`${event.title}${event.subtitle ? " — " + event.subtitle : ""}`, { align: "center" });
      doc.moveDown(1);
      const paid = registrations.filter((r) => r.paymentStatus === "paid" && r.confirmationCode);
      const cellW = 135;
      const cellH = 145;
      const startX = 36;
      let startY = doc.y;
      let col = 0;
      let row = 0;
      const maxCols = 4;
      const maxRows = 4; // conservative for margins
      for (const r of paid) {
        if (row >= maxRows) {
          doc.addPage();
          doc.fontSize(10).fillColor("#666").text("CHAOS CARTEL — TEAR-OFF LABELS (cont.)", { align: "center" });
          doc.moveDown(1);
          startY = doc.y;
          row = 0;
          col = 0;
        }
        const x = startX + col * cellW;
        const y = startY + row * cellH;
        // Border
        doc.rect(x, y, cellW - 6, cellH - 6).dash(2, { space: 2 }).strokeColor("#999").stroke().undash();
        // QR
        const qrDataUrl = qrs[r.confirmationCode!];
        if (qrDataUrl) {
          const buf = Buffer.from(qrDataUrl.split(",")[1], "base64");
          doc.image(buf, x + 8, y + 6, { width: 90, height: 90 });
        }
        // Name (right of QR)
        doc.fontSize(9).fillColor("#000").font("Helvetica-Bold");
        doc.text(`${r.firstName}`, x + 100, y + 10, { width: 32, ellipsis: true });
        doc.text(`${r.lastName}`, x + 100, y + 22, { width: 32, ellipsis: true });
        doc.font("Helvetica").fontSize(7).fillColor("#666");
        doc.text(r.ticketType.replace("_", "-"), x + 100, y + 40, { width: 32 });
        // Code below QR
        doc.fontSize(7).font("Courier").fillColor("#000");
        doc.text(r.confirmationCode || "", x + 4, y + 102, { width: cellW - 14, align: "center" });
        doc.font("Helvetica");
        col += 1;
        if (col >= maxCols) {
          col = 0;
          row += 1;
        }
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
