import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ShoppingBag, X, Truck, Plus, Minus, Check } from "lucide-react";
import { useLocation } from "wouter";
import { Shell } from "@/components/brand/Shell";
import { useToast } from "@/hooks/use-toast";
import { useCart } from "@/lib/cart";
import type { Product } from "@shared/schema";

// The API enriches products with per-size stock + aggregate totals.
interface Variant { size: string | null; quantity: number; unlimitedStock: boolean; }
interface ProductWithStock extends Product { variants: Variant[]; totalStock: number | null; }

function stockForSize(product: ProductWithStock, size: string | null): number | null {
  const v = product.variants.find(v => (v.size ?? "") === (size ?? ""));
  if (!v) return 0;
  if (v.unlimitedStock) return null; // null = unlimited
  return v.quantity;
}

export default function MerchPage() {
  const { data: products, isLoading } = useQuery<ProductWithStock[]>({ queryKey: ["/api/products"] });
  const [selected, setSelected] = useState<ProductWithStock | null>(null);

  // Hide products whose entire stock is 0 (all sizes sold out AND no unlimited variants).
  const visible = (products || []).filter(p => p.totalStock === null || p.totalStock > 0);

  return (
    <Shell>
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-14 md:py-20">
        <p className="font-mono text-xs tracking-widest text-cc-cyan mb-4">// STORE</p>
        <h1 className="font-display font-extrabold text-5xl md:text-7xl italic text-cc-cyan text-shadow-neon-cyan cc-skew">
          <span className="slash-under">MERCH</span>
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-foreground/90">Wear the crew. Ship anywhere in the US.</p>
        <p className="mt-3 inline-flex items-center gap-2 rounded-md border border-cc-cyan/40 bg-cc-cyan/5 px-3 py-1.5 text-xs font-mono tracking-widest text-cc-cyan">
          <Truck size={14}/> FLAT $7 SHIPPING · STICKERS &amp; DECALS $3 · ONE CHARGE PER ORDER
        </p>

        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {isLoading && [1,2,3].map(i => (
            <div key={i} className="rounded-2xl border border-cc-purple/40 bg-card h-96 animate-pulse" />
          ))}
          {visible.map((p, i) => (
            <ProductCard key={p.id} product={p} index={i} onBuy={() => setSelected(p)} />
          ))}
          {!isLoading && visible.length === 0 && (
            <div className="col-span-full text-center py-16 text-foreground/60 font-mono text-sm">
              // ALL SOLD OUT — CHECK BACK SOON
            </div>
          )}
        </div>
      </section>
      {selected && <AddToCartModal product={selected} onClose={() => setSelected(null)} />}
    </Shell>
  );
}

function ProductCard({ product, index, onBuy }: { product: ProductWithStock; index: number; onBuy: () => void }) {
  // "Only N left" if any tracked (non-unlimited) variant has ≤3 stock.
  const lowestTracked = product.variants
    .filter(v => !v.unlimitedStock)
    .reduce<number | null>((min, v) => (min === null || v.quantity < min ? v.quantity : min), null);
  const showLowStock = lowestTracked !== null && lowestTracked > 0 && lowestTracked <= 3;
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
        {showLowStock && (
          <div className="absolute top-3 right-3 px-2 py-0.5 text-[10px] font-display font-extrabold tracking-widest rounded bg-black/70 text-cc-magenta border border-cc-magenta/60 animate-pulse">
            ONLY {lowestTracked} LEFT
          </div>
        )}
      </div>
      <h3 className="font-display font-extrabold text-xl italic">{product.name}</h3>
      <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{product.description}</p>
      <div className="mt-5 flex items-end justify-between gap-3 pt-4 border-t border-cc-purple/30">
        <div className={`font-display font-extrabold text-3xl italic text-${accent}`}>${(product.priceCents/100).toFixed(0)}</div>
        <button onClick={onBuy} className="px-5 py-2.5 rounded-md btn-neon-lime text-sm" data-testid={`button-buy-${product.slug}`}>
          ADD TO CART →
        </button>
      </div>
    </div>
  );
}

function AddToCartModal({ product, onClose }: { product: ProductWithStock; onClose: () => void }) {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const { addToCart, itemCount, lines } = useCart();
  const sizes: string[] = product.sizes ? JSON.parse(product.sizes) : [];

  // Default to first size with stock available.
  const firstAvailable = sizes.find(s => {
    const st = stockForSize(product, s);
    return st === null || st > 0;
  }) || sizes[0] || "";
  const [size, setSize] = useState<string>(firstAvailable);
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);

  // Stock available for the selected size, minus what's already in the cart for this variant.
  const selectedStock = stockForSize(product, sizes.length > 0 ? size : null);
  const inCartAlready = lines
    .filter(l => l.productId === product.id && (l.size ?? "") === ((sizes.length > 0 ? size : null) ?? ""))
    .reduce((sum, l) => sum + l.quantity, 0);
  const maxAddable = selectedStock === null ? 20 : Math.max(0, selectedStock - inCartAlready);
  const isOOS = maxAddable === 0;

  function handleAdd(then?: "keep-shopping" | "view-cart") {
    if (isOOS) return;
    const finalQty = Math.min(quantity, maxAddable);
    addToCart({
      productId: product.id,
      productSlug: product.slug,
      productName: product.name,
      imageUrl: product.imageUrl,
      category: product.category,
      size: sizes.length > 0 ? size : null,
      quantity: finalQty,
      unitPriceCents: product.priceCents,
    });
    setAdded(true);
    toast({
      title: "Added to cart",
      description: `${finalQty} × ${product.name}${sizes.length > 0 ? ` (${size})` : ""}`,
    });
    if (then === "view-cart") {
      onClose();
      navigate("/cart");
    } else if (then === "keep-shopping") {
      onClose();
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm grid place-items-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="w-full max-w-md bg-card border-2 border-cc-lime/60 rounded-2xl p-6 glow-lime my-8" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-5">
          <div className="flex-1 min-w-0">
            <div className="text-xs font-mono tracking-widest text-cc-cyan mb-1">ADD TO CART</div>
            <h3 className="font-display font-extrabold text-2xl italic truncate">{product.name}</h3>
            <div className="mt-1 font-display font-extrabold text-2xl italic text-cc-lime">${(product.priceCents/100).toFixed(0)}</div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-cc-lime shrink-0" data-testid="button-close-modal"><X /></button>
        </div>

        {product.imageUrl && (
          <div className="mb-5 aspect-square rounded-xl border border-cc-purple/40 bg-black/40 overflow-hidden">
            <img src={product.imageUrl} alt={product.name} className="w-full h-full object-contain p-2"/>
          </div>
        )}

        <p className="text-sm text-foreground/80 mb-5">{product.description}</p>

        {sizes.length > 0 && (
          <div className="mb-5">
            <label className="block text-xs font-mono tracking-widest text-cc-cyan mb-1.5">SIZE</label>
            <div className="flex flex-wrap gap-2">
              {sizes.map(s => {
                const st = stockForSize(product, s);
                const soldOut = st !== null && st <= 0;
                return (
                  <button
                    type="button"
                    key={s}
                    onClick={() => { if (!soldOut) { setSize(s); setQuantity(1); } }}
                    disabled={soldOut}
                    className={`px-4 py-2 rounded-md border-2 text-sm font-display font-bold transition relative ${
                      soldOut
                        ? "border-cc-purple/20 text-foreground/30 cursor-not-allowed line-through"
                        : size === s
                          ? "border-cc-lime bg-cc-lime text-black"
                          : "border-cc-purple/40 hover:border-cc-lime/50"
                    }`}
                    data-testid={`size-${s}`}
                    title={soldOut ? `${s} sold out` : undefined}
                  >{s}</button>
                );
              })}
            </div>
            {selectedStock !== null && selectedStock > 0 && selectedStock <= 5 && !isOOS && (
              <p className="mt-2 text-xs font-mono tracking-widest text-cc-magenta">
                ONLY {selectedStock - inCartAlready} LEFT{inCartAlready > 0 ? ` (${inCartAlready} in cart)` : ""}
              </p>
            )}
            {isOOS && (
              <p className="mt-2 text-xs font-mono tracking-widest text-cc-magenta">
                {inCartAlready > 0 ? `MAX QUANTITY IN CART (${inCartAlready})` : "OUT OF STOCK"}
              </p>
            )}
          </div>
        )}

        <div className="mb-6">
          <label className="block text-xs font-mono tracking-widest text-cc-cyan mb-1.5">QUANTITY</label>
          <div className="inline-flex items-center rounded-md border-2 border-cc-purple/40">
            <button
              onClick={() => setQuantity(q => Math.max(1, q - 1))}
              className="px-3 py-2 text-cc-cyan hover:bg-cc-cyan/10"
              aria-label="Decrease"
              type="button"
            ><Minus size={16}/></button>
            <span className="px-5 py-2 font-display font-bold min-w-[3rem] text-center">{quantity}</span>
            <button
              onClick={() => setQuantity(q => Math.min(maxAddable || 20, q + 1))}
              className="px-3 py-2 text-cc-cyan hover:bg-cc-cyan/10 disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label="Increase"
              type="button"
              disabled={quantity >= maxAddable || isOOS}
            ><Plus size={16}/></button>
          </div>
        </div>

        <div className="rounded-lg border border-cc-purple/40 bg-black/40 p-3 mb-5">
          <div className="flex justify-between">
            <span className="font-display font-bold text-base">LINE TOTAL</span>
            <span className="font-display font-extrabold text-xl text-cc-lime">
              ${(product.priceCents * quantity / 100).toFixed(2)}
            </span>
          </div>
          <p className="mt-1 text-[10px] font-mono tracking-widest text-foreground/50">
            SHIPPING CHARGED ONCE AT CHECKOUT
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => handleAdd("keep-shopping")}
            className="px-4 py-3 rounded-md border-2 border-cc-lime/60 text-cc-lime font-display font-bold text-sm hover:bg-cc-lime/10 inline-flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            type="button"
            data-testid="button-add-keep-shopping"
            disabled={isOOS}
          >
            {added ? <Check size={14}/> : null} {isOOS ? "SOLD OUT" : "ADD & KEEP SHOPPING"}
          </button>
          <button
            onClick={() => handleAdd("view-cart")}
            className="px-4 py-3 rounded-md btn-neon-lime text-sm inline-flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            type="button"
            data-testid="button-add-view-cart"
            disabled={isOOS}
          >
            {isOOS ? "SOLD OUT" : "ADD & VIEW CART →"}
          </button>
        </div>
        {itemCount > 0 && (
          <p className="mt-3 text-center text-[10px] font-mono tracking-widest text-foreground/50">
            {itemCount} ITEM{itemCount === 1 ? "" : "S"} ALREADY IN CART
          </p>
        )}
      </div>
    </div>
  );
}
