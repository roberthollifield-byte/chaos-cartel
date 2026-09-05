import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Menu, X, ShoppingBag } from "lucide-react";
import { Logo } from "./Logo";
import { useCart } from "@/lib/cart";

const links = [
  { href: "/sessions", label: "SESSIONS" },
  { href: "/rules", label: "RULES" },
  { href: "/crew", label: "FC CREW" },
  { href: "/merch", label: "MERCH" },
];

export function Nav() {
  const [open, setOpen] = useState(false);
  const [location] = useLocation();
  const { itemCount } = useCart();

  return (
    <header className="sticky top-0 z-40 border-b border-cc-purple/40 backdrop-blur-md bg-background/85">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 md:h-20">
          <Link href="/" className="hover:opacity-80 transition-opacity" data-testid="link-home">
            <Logo />
          </Link>

          <nav className="hidden md:flex items-center gap-8">
            {links.map(l => (
              <Link
                key={l.href}
                href={l.href}
                data-testid={`link-${l.label.toLowerCase()}`}
                className={`font-display font-bold text-sm tracking-widest transition-colors hover:text-cc-lime ${
                  location.startsWith(l.href) ? "text-cc-lime" : "text-foreground"
                }`}
              >
                {l.label}
              </Link>
            ))}
          </nav>

          <div className="hidden md:flex items-center gap-3">
            <CartIcon count={itemCount} />
            <Link
              href="/sessions"
              data-testid="link-register-now"
              className="inline-block px-6 py-2.5 rounded-md btn-neon-outline-cyan text-sm"
            >
              REGISTER NOW
            </Link>
          </div>

          <div className="md:hidden flex items-center gap-2">
            <CartIcon count={itemCount} />
            <button
              className="text-cc-lime"
              aria-label="Open menu"
              onClick={() => setOpen(!open)}
              data-testid="button-menu-toggle"
            >
              {open ? <X size={28} /> : <Menu size={28} />}
            </button>
          </div>
        </div>
      </div>

      {open && (
        <nav className="md:hidden border-t border-cc-purple/40 bg-background/95 backdrop-blur-md">
          <div className="px-6 py-6 flex flex-col gap-4">
            {links.map(l => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                data-testid={`mobile-link-${l.label.toLowerCase()}`}
                className="font-display font-bold text-lg tracking-widest text-foreground hover:text-cc-lime"
              >
                {l.label}
              </Link>
            ))}
            <Link
              href="/sessions"
              onClick={() => setOpen(false)}
              data-testid="mobile-link-register-now"
              className="inline-block px-6 py-3 mt-2 rounded-md btn-neon-outline-cyan text-sm text-center"
            >
              REGISTER NOW
            </Link>
          </div>
        </nav>
      )}
    </header>
  );
}

function CartIcon({ count }: { count: number }) {
  return (
    <Link
      href="/cart"
      data-testid="link-cart"
      aria-label={`Cart (${count} item${count === 1 ? "" : "s"})`}
      className="relative inline-flex items-center justify-center w-11 h-11 rounded-md border border-cc-purple/50 text-foreground hover:text-cc-lime hover:border-cc-lime transition-colors"
    >
      <ShoppingBag size={20} />
      {count > 0 && (
        <span
          className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1 grid place-items-center rounded-full bg-cc-lime text-black text-[11px] font-display font-extrabold border-2 border-background"
          data-testid="cart-count"
        >
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
