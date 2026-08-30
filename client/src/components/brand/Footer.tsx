import { Link } from "wouter";
import { Logo } from "./Logo";
import { Instagram, Mail, MapPin } from "lucide-react";

export function Footer() {
  return (
    <footer className="border-t border-cc-purple/40 mt-24 pt-16 pb-10 bg-background/80">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 grid gap-10 md:grid-cols-4">
        <div className="md:col-span-2">
          <Logo size={44} />
          <p className="mt-5 max-w-md text-muted-foreground">
            Underground drift practice at the track in Forest City, North Carolina.
            Drivers, ride-alongs, spectators — all welcome.
          </p>
        </div>
        <div>
          <div className="font-display font-bold text-cc-cyan tracking-widest mb-4">SITE</div>
          <ul className="space-y-2.5">
            <li><Link href="/sessions" className="hover:text-cc-lime">Sessions</Link></li>
            <li><Link href="/rules" className="hover:text-cc-lime">Rules</Link></li>
            <li><Link href="/crew" className="hover:text-cc-lime">FC Crew</Link></li>
            <li><Link href="/merch" className="hover:text-cc-lime">Merch</Link></li>
          </ul>
        </div>
        <div>
          <div className="font-display font-bold text-cc-magenta tracking-widest mb-4">CONTACT</div>
          <ul className="space-y-2.5 text-muted-foreground">
            <li className="flex items-center gap-2"><MapPin size={16} className="text-cc-lime" /> Forest City, NC</li>
            <li className="flex items-center gap-2"><Mail size={16} className="text-cc-lime" /> hello@chaoscartel.com</li>
            <li className="flex items-center gap-2"><Instagram size={16} className="text-cc-lime" /> @chaoscartel</li>
          </ul>
        </div>
      </div>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 mt-12 pt-6 border-t border-cc-purple/25 text-xs text-muted-foreground flex flex-wrap gap-4 justify-between items-center">
        <span>© {new Date().getFullYear()} Chaos Cartel. Slide safe.</span>
        <span className="font-mono">DRIFT PRACTICE · FOREST CITY, NC</span>
      </div>
    </footer>
  );
}
