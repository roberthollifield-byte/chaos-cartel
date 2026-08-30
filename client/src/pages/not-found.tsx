import { Link } from "wouter";
import { Shell } from "@/components/brand/Shell";

export default function NotFoundPage() {
  return (
    <Shell>
      <section className="mx-auto max-w-2xl px-6 py-32 text-center">
        <h1 className="font-display font-extrabold text-8xl italic text-cc-magenta text-shadow-neon-magenta cc-skew">404</h1>
        <p className="mt-4 text-lg text-muted-foreground">You slid off the map.</p>
        <Link href="/" className="mt-10 inline-block px-7 py-4 rounded-md btn-neon-lime">BACK TO HQ</Link>
      </section>
    </Shell>
  );
}
