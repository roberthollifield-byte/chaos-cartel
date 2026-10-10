// Site-wide sales switches. Existing tickets, QR codes, waivers, and gate
// check-in keep working regardless. Flip a flag and redeploy to change it.
//
// TICKET_SALES_OPEN: event tickets (drivers, ride-alongs, spectators).
// MERCH_SALES_OPEN:  merchandise (single-item buy + cart checkout).
export const TICKET_SALES_OPEN = false;
export const MERCH_SALES_OPEN = true;
export const SALES_CLOSED_MESSAGE = "Sales are currently closed.";
