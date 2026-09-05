import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ShoppingBag, X } from "lucide-react";
import { Shell } from "@/components/brand/Shell";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Product } from "@shared/schema";

export default function MerchPage() {
  const { data: products, isLoading } = useQuery<Product[]>({ queryKey: ["/api/products"] });
  const [selected, setSelected] = useState<Product | null>(null);

  return (
    <Shell>
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-14 md:py-20">
        <p className="font-mono text-xs tracking-widest text-cc-cyan mb-4">// STORE</p>
        <h1 className="font-display font-extrabold text-5xl md:text-7xl italic text-cc-cyan text-shadow-neon-cyan cc-skew">
          <span className="slash-under">MERCH</span>
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-foreground/90">Wear the crew. Ship anywhere in the US.</p>

        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {isLoading && [1,2,3].map(i => (
            <div key={i} className="rounded-2xl border border-cc-purple/40 bg-card h-96 animate-pulse" />
          ))}
          {(products || []).map((p, i) => (
            <ProductCard key={p.id} product={p} index={i} onBuy={() => setSelected(p)} />
          ))}
        </div>
      </section>
      {selected && <BuyModal product={selected} onClose={() => setSelected(null)} />}
    </Shell>
  );
}

function ProductCard({ product, index, onBuy }: { product: Product; index: number; onBuy: () => void }) {
  const accents = ["cc-lime","cc-magenta","cc-cyan"] as const;
  const accent = accents[index % accents.length];
  return (
    <div
      className={`p-5 rounded-2xl border-2 border-${accent}/50 bg-card hover:-translate-y-1 transition-transform flex flex-col`}
      data-testid={`product-card-${product.slug}`}
    >
      <div className={`aspect-square rounded-xl bg-gradient-to-br from-${accent}/25 via-cc-purple/25 to-cc-magenta/15 grid place-items-center mb-5 border border-${accent}/40 relative overflow-hidden`}>
        {product.imageUrl ? (
          <img src={product.imageUrl} alt={product.name} className="w-full h-full object-contain p-2" />
        ) : (
          <ShoppingBag className={`text-${accent}`} size={80} strokeWidth={1.4} />
        )}
        <div className="absolute top-3 left-3 px-2 py-0.5 text-[10px] font-display font-extrabold tracking-widest rounded bg-black/70 text-cc-lime border border-cc-lime/50">
          {product.category.toUpperCase()}
        </div>
      </div>
      <h3 className="font-display font-extrabold text-xl italic">{product.name}</h3>
      <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{product.description}</p>
      <div className="mt-5 flex items-end justify-between gap-3 pt-4 border-t border-cc-purple/30">
        <div className={`font-display font-extrabold text-3xl italic text-${accent}`}>${(product.priceCents/100).toFixed(0)}</div>
        <button onClick={onBuy} className="px-5 py-2.5 rounded-md btn-neon-lime text-sm" data-testid={`button-buy-${product.slug}`}>
          BUY →
        </button>
      </div>
    </div>
  );
}

function BuyModal({ product, onClose }: { product: Product; onClose: () => void }) {
  const { toast } = useToast();
  const sizes: string[] = product.sizes ? JSON.parse(product.sizes) : [];
  const [form, setForm] = useState({
    size: sizes[0] || "",
    firstName: "", lastName: "", email: "", phone: "",
    shippingAddress: "", shippingCity: "", shippingState: "NC", shippingZip: "",
  });

  const mutation = useMutation({
    mutationFn: async (payload: any) => (await apiRequest("POST", "/api/merch-orders", payload)).json(),
    onSuccess: (data) => {
      if (data.checkoutUrl) window.location.href = data.checkoutUrl;
    },
    onError: (err: any) => toast({ title: "Order failed", description: err.message, variant: "destructive" }),
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm grid place-items-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="w-full max-w-lg bg-card border-2 border-cc-lime/60 rounded-2xl p-6 glow-lime my-8" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-5">
          <div>
            <div className="text-xs font-mono tracking-widest text-cc-cyan mb-1">ORDER</div>
            <h3 className="font-display font-extrabold text-2xl italic">{product.name}</h3>
            <div className="mt-1 font-display font-extrabold text-2xl italic text-cc-lime">${(product.priceCents/100).toFixed(0)}</div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-cc-lime" data-testid="button-close-modal"><X /></button>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); mutation.mutate({ productId: product.id, ...form }); }} className="space-y-4">
          {sizes.length > 0 && (
            <div>
              <label className="block text-xs font-mono tracking-widest text-cc-cyan mb-1.5">SIZE</label>
              <div className="flex flex-wrap gap-2">
                {sizes.map(s => (
                  <button
                    type="button"
                    key={s}
                    onClick={()=>setForm(f => ({...f, size:s}))}
                    className={`px-4 py-2 rounded-md border-2 text-sm font-display font-bold ${form.size===s ? "border-cc-lime bg-cc-lime text-black" : "border-cc-purple/40 hover:border-cc-lime/50"}`}
                    data-testid={`size-${s}`}
                  >{s}</button>
                ))}
              </div>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <MerchInput label="First name" value={form.firstName} onChange={v=>setForm(f=>({...f,firstName:v}))} data-testid="input-firstName" />
            <MerchInput label="Last name" value={form.lastName} onChange={v=>setForm(f=>({...f,lastName:v}))} data-testid="input-lastName" />
            <MerchInput label="Email" type="email" value={form.email} onChange={v=>setForm(f=>({...f,email:v}))} data-testid="input-email" />
            <MerchInput label="Phone (optional)" value={form.phone} onChange={v=>setForm(f=>({...f,phone:v}))} />
          </div>
          <MerchInput label="Shipping address" value={form.shippingAddress} onChange={v=>setForm(f=>({...f,shippingAddress:v}))} data-testid="input-shippingAddress" />
          <div className="grid gap-3 sm:grid-cols-3">
            <MerchInput label="City" value={form.shippingCity} onChange={v=>setForm(f=>({...f,shippingCity:v}))} data-testid="input-city" />
            <MerchInput label="State" value={form.shippingState} onChange={v=>setForm(f=>({...f,shippingState:v}))} data-testid="input-state" />
            <MerchInput label="ZIP" value={form.shippingZip} onChange={v=>setForm(f=>({...f,shippingZip:v}))} data-testid="input-zip" />
          </div>
          <button
            type="submit"
            disabled={mutation.isPending}
            className="w-full px-6 py-4 rounded-md btn-neon-lime text-base disabled:opacity-60"
            data-testid="button-checkout"
          >
            {mutation.isPending ? "REDIRECTING…" : `CHECKOUT — $${(product.priceCents/100).toFixed(0)} →`}
          </button>
        </form>
      </div>
    </div>
  );
}

function MerchInput({ label, value, onChange, type="text", ...rest }: any) {
  return (
    <div>
      <label className="block text-xs font-mono tracking-widest text-cc-cyan mb-1.5">{label.toUpperCase()}</label>
      <input
        type={type}
        value={value}
        onChange={e=>onChange(e.target.value)}
        className="w-full px-3 py-2.5 rounded-md bg-background border-2 border-cc-purple/40 text-foreground focus:border-cc-lime focus:outline-none transition-colors"
        required
        {...rest}
      />
    </div>
  );
}
