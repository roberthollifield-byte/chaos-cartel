import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ShoppingBag, Trash2, Plus, Minus, ArrowLeft, Truck } from "lucide-react";
import { Link } from "wouter";
import { Shell } from "@/components/brand/Shell";
import { useCart } from "@/lib/cart";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface ShippingQuote { shippingCents: number; label: string; etaDays: string; }

export default function CartPage() {
  const { lines, itemCount, subtotalCents, categories, updateQuantity, removeFromCart } = useCart();
  const { toast } = useToast();
  const [form, setForm] = useState({
    firstName: "", lastName: "", email: "", phone: "",
    shippingAddress: "", shippingCity: "", shippingState: "NC", shippingZip: "",
  });

  const [canceled, setCanceled] = useState(false);
  useEffect(() => {
    // If Stripe bounced them back with ?canceled=1, show a friendly line at top.
    try {
      const hash = window.location.hash || "";
      if (hash.includes("canceled=1")) setCanceled(true);
    } catch {}
  }, []);

  // Shipping quote depends on which categories are in the cart (all envelope → $3, else $7).
  const categoriesKey = [...new Set(categories)].sort().join(",");
  const { data: quote } = useQuery<ShippingQuote>({
    queryKey: [`/api/shipping-quote?categories=${categoriesKey}`],
    enabled: lines.length > 0,
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        items: lines.map(l => ({ productId: l.productId, size: l.size, quantity: l.quantity })),
        ...form,
      };
      const res = await apiRequest("POST", "/api/cart-checkout", payload);
      return res.json();
    },
    onSuccess: (data) => {
      if (data.checkoutUrl) window.location.href = data.checkoutUrl;
    },
    onError: (err: any) => toast({ title: "Checkout failed", description: err.message, variant: "destructive" }),
  });

  const totalCents = subtotalCents + (quote?.shippingCents || 0);

  return (
    <Shell>
      <section className="pt-28 md:pt-32 pb-24 px-6 md:px-12 max-w-5xl mx-auto">
        <div className="mb-8">
          <Link href="/merch">
            <a className="inline-flex items-center gap-2 text-sm font-mono tracking-widest text-cc-cyan hover:text-cc-lime transition">
              <ArrowLeft size={14}/> BACK TO MERCH
            </a>
          </Link>
        </div>
        <h1 className="font-display font-extrabold text-5xl md:text-6xl italic text-cc-lime text-shadow-neon-lime cc-skew">
          <span className="slash-under">YOUR CART</span>
        </h1>
        <p className="mt-4 text-foreground/70 font-mono tracking-wider text-sm">
          {itemCount === 0 ? "EMPTY" : `${itemCount} ITEM${itemCount === 1 ? "" : "S"}`}
        </p>

        {canceled && (
          <div className="mt-6 rounded-lg border border-cc-magenta/50 bg-cc-magenta/10 p-4 text-sm text-foreground/90">
            Checkout was canceled. Your cart is still here — hit checkout again when you're ready.
          </div>
        )}

        {lines.length === 0 ? (
          <div className="mt-12 text-center py-20 border-2 border-dashed border-cc-purple/40 rounded-2xl">
            <ShoppingBag size={48} className="mx-auto text-cc-purple/60"/>
            <p className="mt-4 text-foreground/70">Nothing in the cart yet.</p>
            <Link href="/merch">
              <a className="mt-6 inline-block px-6 py-3 rounded-md btn-neon-lime text-sm">SHOP MERCH →</a>
            </Link>
          </div>
        ) : (
          <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_400px]">
            {/* LEFT: item list */}
            <div className="space-y-4">
              {lines.map(line => (
                <div key={`${line.productId}-${line.size || ""}`}
                     className="flex gap-4 p-4 rounded-xl border border-cc-purple/40 bg-card/60"
                     data-testid={`cart-line-${line.productSlug}`}>
                  {line.imageUrl && (
                    <img src={line.imageUrl} alt="" className="w-24 h-24 object-cover rounded-lg border border-cc-purple/40"/>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between gap-2">
                      <div>
                        <p className="font-display font-bold text-lg leading-tight">{line.productName}</p>
                        {line.size && (
                          <p className="mt-1 text-xs font-mono tracking-widest text-cc-cyan">SIZE {line.size}</p>
                        )}
                        <p className="mt-1 text-sm text-foreground/70">${(line.unitPriceCents/100).toFixed(2)} each</p>
                      </div>
                      <button
                        onClick={() => removeFromCart(line.productId, line.size)}
                        className="p-2 rounded-md text-cc-magenta hover:bg-cc-magenta/10 transition self-start"
                        aria-label="Remove"
                        data-testid={`button-remove-${line.productSlug}`}
                      >
                        <Trash2 size={16}/>
                      </button>
                    </div>
                    <div className="mt-3 flex items-center justify-between">
                      <div className="inline-flex items-center rounded-md border border-cc-purple/40">
                        <button
                          onClick={() => updateQuantity(line.productId, line.size, line.quantity - 1)}
                          className="px-3 py-1.5 text-cc-cyan hover:bg-cc-cyan/10"
                          aria-label="Decrease"
                        ><Minus size={14}/></button>
                        <span className="px-4 py-1.5 font-display font-bold min-w-[3rem] text-center">{line.quantity}</span>
                        <button
                          onClick={() => updateQuantity(line.productId, line.size, Math.min(20, line.quantity + 1))}
                          className="px-3 py-1.5 text-cc-cyan hover:bg-cc-cyan/10"
                          aria-label="Increase"
                        ><Plus size={14}/></button>
                      </div>
                      <p className="font-display font-extrabold text-lg text-cc-lime">
                        ${(line.unitPriceCents * line.quantity / 100).toFixed(2)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* RIGHT: shipping + totals + checkout form */}
            <aside className="space-y-4">
              <div className="rounded-2xl border-2 border-cc-lime/50 bg-card p-5 space-y-3 glow-lime">
                <h2 className="font-display font-extrabold text-xl italic text-cc-lime">ORDER SUMMARY</h2>
                <div className="flex justify-between text-sm text-foreground/80">
                  <span>Subtotal</span>
                  <span>${(subtotalCents/100).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm text-foreground/80">
                  <span className="inline-flex items-center gap-1.5">
                    <Truck size={14} className="text-cc-cyan"/> Shipping (flat)
                  </span>
                  <span>{quote ? `$${(quote.shippingCents/100).toFixed(2)}` : "—"}</span>
                </div>
                {quote && (
                  <p className="text-[10px] font-mono tracking-widest text-foreground/50 pl-5">
                    {quote.label.toUpperCase()} · {quote.etaDays.toUpperCase()}
                  </p>
                )}
                <div className="flex justify-between pt-3 border-t border-cc-purple/40">
                  <span className="font-display font-bold text-lg">TOTAL</span>
                  <span className="font-display font-extrabold text-xl text-cc-lime">
                    ${(totalCents/100).toFixed(2)}
                  </span>
                </div>
              </div>

              <form
                onSubmit={(e) => { e.preventDefault(); mutation.mutate(); }}
                className="rounded-2xl border border-cc-purple/40 bg-card p-5 space-y-3"
              >
                <h3 className="font-display font-bold text-base tracking-widest text-cc-cyan">SHIP TO</h3>
                <div className="grid grid-cols-2 gap-3">
                  <MerchInput label="First name" value={form.firstName} onChange={v=>setForm(f=>({...f,firstName:v}))} required data-testid="input-first-name" />
                  <MerchInput label="Last name" value={form.lastName} onChange={v=>setForm(f=>({...f,lastName:v}))} required data-testid="input-last-name" />
                </div>
                <MerchInput label="Email" type="email" value={form.email} onChange={v=>setForm(f=>({...f,email:v}))} required data-testid="input-email" />
                <MerchInput label="Phone (optional)" value={form.phone} onChange={v=>setForm(f=>({...f,phone:v}))} data-testid="input-phone" />
                <MerchInput label="Address" value={form.shippingAddress} onChange={v=>setForm(f=>({...f,shippingAddress:v}))} required data-testid="input-address" />
                <div className="grid grid-cols-3 gap-3">
                  <MerchInput label="City" value={form.shippingCity} onChange={v=>setForm(f=>({...f,shippingCity:v}))} required data-testid="input-city" />
                  <MerchInput label="State" value={form.shippingState} onChange={v=>setForm(f=>({...f,shippingState:v}))} required data-testid="input-state" />
                  <MerchInput label="ZIP" value={form.shippingZip} onChange={v=>setForm(f=>({...f,shippingZip:v}))} required data-testid="input-zip" />
                </div>
                <button
                  type="submit"
                  disabled={mutation.isPending || !quote || lines.length === 0}
                  className="w-full px-6 py-4 rounded-md btn-neon-lime text-base disabled:opacity-60"
                  data-testid="button-checkout"
                >
                  {mutation.isPending ? "REDIRECTING…" : `CHECKOUT — $${(totalCents/100).toFixed(2)} →`}
                </button>
                <p className="text-[10px] font-mono tracking-widest text-foreground/40 text-center pt-1">
                  SECURE CHECKOUT VIA STRIPE
                </p>
              </form>
            </aside>
          </div>
        )}
      </section>
    </Shell>
  );
}

function MerchInput({ label, value, onChange, type = "text", required = false, ...rest }: any) {
  return (
    <label className="block">
      <span className="text-[10px] font-mono tracking-widest text-foreground/60">{label.toUpperCase()}</span>
      <input
        type={type}
        value={value}
        required={required}
        onChange={e => onChange(e.target.value)}
        className="mt-1 w-full px-3 py-2 rounded-md bg-black/40 border border-cc-purple/40 text-foreground focus:border-cc-lime focus:outline-none"
        {...rest}
      />
    </label>
  );
}
