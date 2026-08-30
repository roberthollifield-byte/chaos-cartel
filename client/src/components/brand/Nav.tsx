import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Menu, X } from "lucide-react";
import { Logo } from "./Logo";

const links = [
  { href: "/sessions", label: "SESSIONS" },
  { href: "/rules", label: "RULES" },
  { href: "/crew", label: "FC CREW" },
  { href: "/merch", label: "MERCH" },
];

export function Nav() {
  const [open, setOpen] = useState(false);
  const [location] = useLocation();

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

          <div className="hidden md:block">
            <Link
              href="/sessions"
              data-testid="link-register-now"
              className="inline-block px-6 py-2.5 rounded-md btn-neon-outline-cyan text-sm"
            >
              REGISTER NOW
            </Link>
          </div>

          <button
            className="md:hidden text-cc-lime"
            aria-label="Open menu"
            onClick={() => setOpen(!open)}
            data-testid="button-menu-toggle"
          >
            {open ? <X size={28} /> : <Menu size={28} />}
          </button>
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
