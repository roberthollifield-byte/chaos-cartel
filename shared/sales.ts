// Site-wide sales switch. When false, ALL new sales are closed:
// event tickets (drivers, ride-alongs, spectators) and merch.
// Existing tickets, QR codes, waivers, and gate check-in keep working.
// Flip to true and redeploy to reopen sales.
export const SALES_OPEN = false;
export const SALES_CLOSED_MESSAGE = "Sales are currently closed.";
