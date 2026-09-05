import { useState, useEffect } from "react";
import { apiBase } from "@/lib/queryClient";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Download, LogOut, Plus, Trash2, Edit2, X, QrCode, FileText } from "lucide-react";
import { Link } from "wouter";
import { Shell } from "@/components/brand/Shell";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Event, Product, CrewMember, Registration, Order } from "@shared/schema";

type Tab = "events" | "registrations" | "orders" | "products" | "crew";

export default function AdminPage() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    fetch(`${apiBase}/api/admin/me`, { credentials: "include" })
      .then(async r => {
        if (!r.ok) return setLoggedIn(false);
        const data = await r.json();
        setLoggedIn(!!data.isAdmin);
      })
      .catch(() => setLoggedIn(false))
      .finally(() => setChecking(false));
  }, []);

  if (checking) return <Shell><div className="mx-auto max-w-2xl px-6 py-32 text-center text-muted-foreground">Checking session…</div></Shell>;
  if (!loggedIn) return <LoginScreen onLogin={() => setLoggedIn(true)} />;
  return <AdminDashboard onLogout={() => setLoggedIn(false)} />;
}

function LoginScreen({ onLogin }: { onLogin: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErr("");
    try {
      const res = await apiRequest("POST", "/api/admin/login", { username, password });
      if (!res.ok) throw new Error("Invalid credentials");
      onLogin();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Shell>
      <section className="mx-auto max-w-md px-4 py-24">
        <p className="font-mono text-xs tracking-widest text-cc-cyan mb-3 text-center">// ADMIN</p>
        <h1 className="font-display font-extrabold text-5xl italic text-center text-cc-lime text-shadow-neon-lime cc-skew mb-10">
          COMMAND CENTER
        </h1>
        <form onSubmit={submit} className="p-8 rounded-2xl border-2 border-cc-lime/50 bg-card space-y-4 glow-lime">
          <div>
            <label className="block text-xs font-mono tracking-widest text-cc-cyan mb-1.5">USERNAME</label>
            <input value={username} onChange={e=>setUsername(e.target.value)} className="w-full px-3 py-2.5 rounded-md bg-background border-2 border-cc-purple/40 focus:border-cc-lime focus:outline-none" data-testid="input-username" />
          </div>
          <div>
            <label className="block text-xs font-mono tracking-widest text-cc-cyan mb-1.5">PASSWORD</label>
            <input type="password" value={password} onChange={e=>setPassword(e.target.value)} className="w-full px-3 py-2.5 rounded-md bg-background border-2 border-cc-purple/40 focus:border-cc-lime focus:outline-none" data-testid="input-password" />
          </div>
          {err && <div className="text-sm text-destructive">{err}</div>}
          <button type="submit" disabled={loading} className="w-full px-6 py-3 rounded-md btn-neon-lime disabled:opacity-60" data-testid="button-login">
            {loading ? "…" : "SIGN IN →"}
          </button>
        </form>
      </section>
    </Shell>
  );
}

function AdminDashboard({ onLogout }: { onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>("events");
  const { toast } = useToast();
  const tabs: {id: Tab; label: string; color: string}[] = [
    { id: "events", label: "EVENTS", color: "cc-lime" },
    { id: "registrations", label: "REGISTRATIONS", color: "cc-magenta" },
    { id: "orders", label: "ORDERS", color: "cc-cyan" },
    { id: "products", label: "MERCH", color: "cc-purple" },
    { id: "crew", label: "CREW", color: "cc-hot-pink" },
  ];

  async function logout() {
    await apiRequest("POST", "/api/admin/logout");
    onLogout();
  }

  return (
    <Shell>
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-14">
        <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
          <div>
            <p className="font-mono text-xs tracking-widest text-cc-cyan mb-2">// ADMIN</p>
            <h1 className="font-display font-extrabold text-4xl md:text-5xl italic text-cc-lime text-shadow-neon-lime cc-skew">COMMAND CENTER</h1>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/admin/checkin" className="inline-flex items-center gap-2 px-4 py-2 rounded-md btn-neon-lime text-sm" data-testid="button-checkin">
              <QrCode size={16}/> GATE CHECK-IN
            </Link>
            <button onClick={logout} className="inline-flex items-center gap-2 px-4 py-2 rounded-md btn-neon-outline-cyan text-sm" data-testid="button-logout">
              <LogOut size={16}/> LOGOUT
            </button>
          </div>
        </div>

        <div className="flex gap-2 border-b border-cc-purple/40 mb-8 overflow-x-auto">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={()=>setTab(t.id)}
              className={`px-4 py-3 font-display font-bold tracking-widest text-sm whitespace-nowrap ${tab===t.id ? `text-${t.color} border-b-2 border-${t.color}` : "text-muted-foreground hover:text-foreground"}`}
              data-testid={`tab-${t.id}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "events" && <EventsPanel />}
        {tab === "registrations" && <RegistrationsPanel />}
        {tab === "orders" && <OrdersPanel />}
        {tab === "products" && <ProductsPanel />}
        {tab === "crew" && <CrewPanel />}
      </section>
    </Shell>
  );
}

// -----------------------------------------------------------------------------
// EVENTS
// -----------------------------------------------------------------------------

function EventsPanel() {
  const { toast } = useToast();
  const { data: events, isLoading } = useQuery<Event[]>({ queryKey: ["/api/admin/events"] });
  const [editing, setEditing] = useState<Event | null>(null);
  const [creating, setCreating] = useState(false);

  const del = useMutation({
    mutationFn: async (id: number) => await apiRequest("DELETE", `/api/admin/events/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      toast({ title: "Event deleted" });
    },
  });

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button onClick={()=>setCreating(true)} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md btn-neon-lime text-sm" data-testid="button-new-event">
          <Plus size={16}/> NEW EVENT
        </button>
      </div>
      <div className="overflow-x-auto rounded-xl border border-cc-purple/40">
        <table className="w-full text-sm">
          <thead className="bg-card">
            <tr className="text-left text-xs font-mono tracking-widest text-cc-cyan">
              <th className="p-3">TITLE</th><th className="p-3">DATE</th><th className="p-3">DRIVER $</th><th className="p-3">SLOTS</th><th className="p-3">STATUS</th><th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Loading…</td></tr>}
            {(events || []).map(e => (
              <tr key={e.id} className="border-t border-cc-purple/30" data-testid={`event-row-${e.id}`}>
                <td className="p-3">{e.title} {e.subtitle && <span className="text-muted-foreground">— {e.subtitle}</span>}</td>
                <td className="p-3">{new Date(e.startsAt*1000).toLocaleDateString()}</td>
                <td className="p-3">${(e.driverPriceCents/100).toFixed(0)}</td>
                <td className="p-3">{e.driverSlots}/{e.rideAlongSlots}/{e.spectatorSlots}</td>
                <td className="p-3"><span className={`px-2 py-0.5 rounded text-xs ${e.status==='published' ? 'bg-cc-lime/20 text-cc-lime' : 'bg-muted text-muted-foreground'}`}>{e.status}</span></td>
                <td className="p-3 text-right whitespace-nowrap">
                  <a
                    href={`/api/admin/roster/${e.id}/pdf`}
                    className="text-cc-magenta hover:text-cc-lime mr-3 inline-flex items-center gap-1"
                    title="Download roster PDF with tear-off QR labels"
                    data-testid={`roster-pdf-${e.id}`}
                  ><FileText size={16}/></a>
                  <button onClick={()=>setEditing(e)} className="text-cc-cyan hover:text-cc-lime mr-3" data-testid={`edit-event-${e.id}`}><Edit2 size={16}/></button>
                  <button onClick={()=>confirm(`Delete "${e.title}"?`) && del.mutate(e.id)} className="text-destructive hover:text-cc-hot-pink" data-testid={`delete-event-${e.id}`}><Trash2 size={16}/></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {(editing || creating) && (
        <EventEditor
          event={editing}
          onClose={() => { setEditing(null); setCreating(false); }}
        />
      )}
    </div>
  );
}

function EventEditor({ event, onClose }: { event: Event | null; onClose: () => void }) {
  const { toast } = useToast();
  const toDateTimeLocal = (unix?: number) => {
    if (!unix) return "";
    const d = new Date(unix * 1000);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const [form, setForm] = useState({
    title: event?.title || "",
    subtitle: event?.subtitle || "",
    slug: event?.slug || "",
    description: event?.description || "",
    startsAt: toDateTimeLocal(event?.startsAt),
    endsAt: toDateTimeLocal(event?.endsAt),
    location: event?.location || "Forest City, NC",
    venue: event?.venue || "",
    driverSlots: event?.driverSlots ?? 20,
    driverPriceCents: (event?.driverPriceCents ?? 15000) / 100,
    rideAlongSlots: event?.rideAlongSlots ?? 30,
    rideAlongPriceCents: (event?.rideAlongPriceCents ?? 3000) / 100,
    spectatorSlots: event?.spectatorSlots ?? 100,
    spectatorPriceCents: (event?.spectatorPriceCents ?? 2000) / 100,
    status: event?.status || "published",
  });

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        ...form,
        startsAt: Math.floor(new Date(form.startsAt).getTime()/1000),
        endsAt: Math.floor(new Date(form.endsAt).getTime()/1000),
        driverPriceCents: Math.round(form.driverPriceCents * 100),
        rideAlongPriceCents: Math.round(form.rideAlongPriceCents * 100),
        spectatorPriceCents: Math.round(form.spectatorPriceCents * 100),
      };
      if (event) return await apiRequest("PATCH", `/api/admin/events/${event.id}`, payload);
      return await apiRequest("POST", "/api/admin/events", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      toast({ title: event ? "Event updated" : "Event created" });
      onClose();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <Modal title={event ? "EDIT EVENT" : "NEW EVENT"} onClose={onClose}>
      <form onSubmit={(e)=>{ e.preventDefault(); save.mutate(); }} className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
        <div className="grid gap-3 sm:grid-cols-2">
          <AdminField label="Title" value={form.title} onChange={v=>setForm(f=>({...f,title:v}))} />
          <AdminField label="Subtitle" value={form.subtitle} onChange={v=>setForm(f=>({...f,subtitle:v}))} />
          <AdminField label="Slug (URL)" value={form.slug} onChange={v=>setForm(f=>({...f,slug:v}))} placeholder="round-4" />
          <div>
            <label className="block text-xs font-mono tracking-widest text-cc-cyan mb-1.5">STATUS</label>
            <select value={form.status} onChange={e=>setForm(f=>({...f,status:e.target.value}))} className="w-full px-3 py-2.5 rounded-md bg-background border-2 border-cc-purple/40 focus:border-cc-lime focus:outline-none">
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="archived">Archived</option>
            </select>
          </div>
        </div>
        <AdminField label="Description" value={form.description} onChange={v=>setForm(f=>({...f,description:v}))} textarea />
        <div className="grid gap-3 sm:grid-cols-2">
          <AdminField label="Starts at" type="datetime-local" value={form.startsAt} onChange={v=>setForm(f=>({...f,startsAt:v}))} />
          <AdminField label="Ends at" type="datetime-local" value={form.endsAt} onChange={v=>setForm(f=>({...f,endsAt:v}))} />
          <AdminField label="Location" value={form.location} onChange={v=>setForm(f=>({...f,location:v}))} />
          <AdminField label="Venue" value={form.venue} onChange={v=>setForm(f=>({...f,venue:v}))} />
        </div>
        <div className="pt-2 border-t border-cc-purple/30">
          <div className="text-xs font-mono tracking-widest text-cc-cyan mb-3">TIERS</div>
          <div className="grid gap-3 sm:grid-cols-3">
            <AdminField label="Driver slots" type="number" value={form.driverSlots} onChange={v=>setForm(f=>({...f,driverSlots:parseInt(v)||0}))} />
            <AdminField label="Driver price ($)" type="number" value={form.driverPriceCents} onChange={v=>setForm(f=>({...f,driverPriceCents:parseFloat(v)||0}))} />
            <div />
            <AdminField label="Ride-along slots" type="number" value={form.rideAlongSlots} onChange={v=>setForm(f=>({...f,rideAlongSlots:parseInt(v)||0}))} />
            <AdminField label="Ride-along price ($)" type="number" value={form.rideAlongPriceCents} onChange={v=>setForm(f=>({...f,rideAlongPriceCents:parseFloat(v)||0}))} />
            <div />
            <AdminField label="Spectator slots" type="number" value={form.spectatorSlots} onChange={v=>setForm(f=>({...f,spectatorSlots:parseInt(v)||0}))} />
            <AdminField label="Spectator price ($)" type="number" value={form.spectatorPriceCents} onChange={v=>setForm(f=>({...f,spectatorPriceCents:parseFloat(v)||0}))} />
          </div>
        </div>
        <button type="submit" disabled={save.isPending} className="w-full px-6 py-3 rounded-md btn-neon-lime disabled:opacity-60" data-testid="button-save-event">
          {save.isPending ? "SAVING…" : "SAVE →"}
        </button>
      </form>
    </Modal>
  );
}

// -----------------------------------------------------------------------------
// REGISTRATIONS
// -----------------------------------------------------------------------------

function RegistrationsPanel() {
  const { data, isLoading } = useQuery<(Registration & { eventTitle?: string })[]>({ queryKey: ["/api/admin/registrations"] });
  return (
    <div>
      <div className="flex justify-end mb-4">
        <a href={`${apiBase}/api/admin/export/registrations.csv`} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md btn-neon-outline-cyan text-sm" data-testid="button-export-registrations">
          <Download size={16}/> EXPORT CSV
        </a>
      </div>
      <div className="overflow-x-auto rounded-xl border border-cc-purple/40">
        <table className="w-full text-sm">
          <thead className="bg-card">
            <tr className="text-left text-xs font-mono tracking-widest text-cc-cyan">
              <th className="p-3">EVENT</th><th className="p-3">NAME</th><th className="p-3">EMAIL</th><th className="p-3">TIER</th><th className="p-3">CAR</th><th className="p-3">PAID</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Loading…</td></tr>}
            {(data || []).map(r => (
              <tr key={r.id} className="border-t border-cc-purple/30" data-testid={`registration-row-${r.id}`}>
                <td className="p-3">{r.eventTitle || `#${r.eventId}`}</td>
                <td className="p-3">{r.firstName} {r.lastName}</td>
                <td className="p-3">{r.email}</td>
                <td className="p-3">
                  <span className={`px-2 py-0.5 rounded text-xs ${
                    r.ticketType === 'driver' ? 'bg-cc-lime/20 text-cc-lime' :
                    r.ticketType === 'ride_along' ? 'bg-cc-magenta/20 text-cc-magenta' :
                    'bg-cc-cyan/20 text-cc-cyan'
                  }`}>{r.ticketType}</span>
                </td>
                <td className="p-3 text-muted-foreground">{r.carMake ? `${r.carYear||''} ${r.carMake} ${r.carModel||''}`.trim() : "—"}</td>
                <td className="p-3">
                  <span className={`px-2 py-0.5 rounded text-xs ${r.paymentStatus==='paid' ? 'bg-cc-lime/20 text-cc-lime' : 'bg-muted text-muted-foreground'}`}>
                    {r.paymentStatus}
                  </span>
                </td>
              </tr>
            ))}
            {!isLoading && (data || []).length === 0 && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">No registrations yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// ORDERS
// -----------------------------------------------------------------------------

function OrdersPanel() {
  const { data, isLoading } = useQuery<(Order & { productName?: string })[]>({ queryKey: ["/api/admin/orders"] });
  return (
    <div className="overflow-x-auto rounded-xl border border-cc-purple/40">
      <table className="w-full text-sm">
        <thead className="bg-card">
          <tr className="text-left text-xs font-mono tracking-widest text-cc-cyan">
            <th className="p-3">PRODUCT</th><th className="p-3">SIZE</th><th className="p-3">CUSTOMER</th><th className="p-3">SHIP TO</th><th className="p-3">PAID</th>
          </tr>
        </thead>
        <tbody>
          {isLoading && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">Loading…</td></tr>}
          {(data || []).map(o => (
            <tr key={o.id} className="border-t border-cc-purple/30" data-testid={`order-row-${o.id}`}>
              <td className="p-3">{o.productName || `#${o.productId}`}</td>
              <td className="p-3">{o.size || "—"}</td>
              <td className="p-3">{o.firstName} {o.lastName}<br/><span className="text-muted-foreground text-xs">{o.email}</span></td>
              <td className="p-3 text-muted-foreground text-xs">{o.shippingAddress}, {o.shippingCity}, {o.shippingState} {o.shippingZip}</td>
              <td className="p-3"><span className={`px-2 py-0.5 rounded text-xs ${o.paymentStatus==='paid' ? 'bg-cc-lime/20 text-cc-lime' : 'bg-muted text-muted-foreground'}`}>{o.paymentStatus}</span></td>
            </tr>
          ))}
          {!isLoading && (data || []).length === 0 && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">No orders yet.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

// -----------------------------------------------------------------------------
// PRODUCTS
// -----------------------------------------------------------------------------

function ProductsPanel() {
  const { toast } = useToast();
  const { data: products, isLoading } = useQuery<Product[]>({ queryKey: ["/api/admin/products"] });
  const [editing, setEditing] = useState<Product | null>(null);
  const [creating, setCreating] = useState(false);

  const del = useMutation({
    mutationFn: async (id: number) => await apiRequest("DELETE", `/api/admin/products/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      toast({ title: "Product deleted" });
    },
  });

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button onClick={()=>setCreating(true)} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md btn-neon-lime text-sm" data-testid="button-new-product">
          <Plus size={16}/> NEW PRODUCT
        </button>
      </div>
      <div className="overflow-x-auto rounded-xl border border-cc-purple/40">
        <table className="w-full text-sm">
          <thead className="bg-card">
            <tr className="text-left text-xs font-mono tracking-widest text-cc-cyan">
              <th className="p-3">NAME</th><th className="p-3">CATEGORY</th><th className="p-3">PRICE</th><th className="p-3">STATUS</th><th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Loading…</td></tr>}
            {(products || []).map(p => (
              <tr key={p.id} className="border-t border-cc-purple/30" data-testid={`product-row-${p.id}`}>
                <td className="p-3">{p.name}</td>
                <td className="p-3 text-muted-foreground">{p.category}</td>
                <td className="p-3">${(p.priceCents/100).toFixed(0)}</td>
                <td className="p-3"><span className={`px-2 py-0.5 rounded text-xs ${p.inStock ? 'bg-cc-lime/20 text-cc-lime' : 'bg-muted text-muted-foreground'}`}>{p.inStock ? 'in stock' : 'sold out'}</span></td>
                <td className="p-3 text-right whitespace-nowrap">
                  <button onClick={()=>setEditing(p)} className="text-cc-cyan hover:text-cc-lime mr-3"><Edit2 size={16}/></button>
                  <button onClick={()=>confirm(`Delete "${p.name}"?`) && del.mutate(p.id)} className="text-destructive hover:text-cc-hot-pink"><Trash2 size={16}/></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {(editing || creating) && <ProductEditor product={editing} onClose={()=>{ setEditing(null); setCreating(false); }} />}
    </div>
  );
}

function ProductEditor({ product, onClose }: { product: Product | null; onClose: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    name: product?.name || "",
    slug: product?.slug || "",
    description: product?.description || "",
    priceCents: (product?.priceCents ?? 3500) / 100,
    imageUrl: product?.imageUrl || "",
    category: product?.category || "apparel",
    sizes: product?.sizes || "[\"S\",\"M\",\"L\",\"XL\"]",
    inStock: product?.inStock ?? true,
  });

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        ...form,
        priceCents: Math.round(form.priceCents * 100),
      };
      if (product) return await apiRequest("PATCH", `/api/admin/products/${product.id}`, payload);
      return await apiRequest("POST", "/api/admin/products", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      toast({ title: product ? "Product updated" : "Product created" });
      onClose();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <Modal title={product ? "EDIT PRODUCT" : "NEW PRODUCT"} onClose={onClose}>
      <form onSubmit={(e)=>{ e.preventDefault(); save.mutate(); }} className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
        <div className="grid gap-3 sm:grid-cols-2">
          <AdminField label="Name" value={form.name} onChange={v=>setForm(f=>({...f,name:v}))} />
          <AdminField label="Slug" value={form.slug} onChange={v=>setForm(f=>({...f,slug:v}))} />
          <AdminField label="Category" value={form.category} onChange={v=>setForm(f=>({...f,category:v}))} />
          <AdminField label="Price ($)" type="number" value={form.priceCents} onChange={v=>setForm(f=>({...f,priceCents:parseFloat(v)||0}))} />
          <AdminField label="Image URL" value={form.imageUrl} onChange={v=>setForm(f=>({...f,imageUrl:v}))} />
          <AdminField label="Sizes (JSON array)" value={form.sizes} onChange={v=>setForm(f=>({...f,sizes:v}))} placeholder='["S","M","L"]' />
          <div className="flex items-center gap-2 pt-6">
            <input type="checkbox" checked={form.inStock} onChange={e=>setForm(f=>({...f,inStock:e.target.checked}))} className="h-4 w-4 accent-[hsl(74_92%_55%)]" />
            <label className="text-sm">In stock</label>
          </div>
        </div>
        <AdminField label="Description" value={form.description} onChange={v=>setForm(f=>({...f,description:v}))} textarea />
        <button type="submit" disabled={save.isPending} className="w-full px-6 py-3 rounded-md btn-neon-lime disabled:opacity-60">
          {save.isPending ? "SAVING…" : "SAVE →"}
        </button>
      </form>
    </Modal>
  );
}

// -----------------------------------------------------------------------------
// CREW
// -----------------------------------------------------------------------------

function CrewPanel() {
  const { toast } = useToast();
  const { data: crew, isLoading } = useQuery<CrewMember[]>({ queryKey: ["/api/admin/crew"] });
  const [editing, setEditing] = useState<CrewMember | null>(null);
  const [creating, setCreating] = useState(false);

  const del = useMutation({
    mutationFn: async (id: number) => await apiRequest("DELETE", `/api/admin/crew/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/crew"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crew"] });
      toast({ title: "Crew member deleted" });
    },
  });

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button onClick={()=>setCreating(true)} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md btn-neon-lime text-sm" data-testid="button-new-crew">
          <Plus size={16}/> NEW MEMBER
        </button>
      </div>
      <div className="overflow-x-auto rounded-xl border border-cc-purple/40">
        <table className="w-full text-sm">
          <thead className="bg-card">
            <tr className="text-left text-xs font-mono tracking-widest text-cc-cyan">
              <th className="p-3">NAME</th><th className="p-3">ROLE</th><th className="p-3">CAR</th><th className="p-3">IG</th><th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">Loading…</td></tr>}
            {(crew || []).map(c => (
              <tr key={c.id} className="border-t border-cc-purple/30" data-testid={`crew-row-${c.id}`}>
                <td className="p-3">{c.name}</td>
                <td className="p-3 text-muted-foreground">{c.role}</td>
                <td className="p-3 text-muted-foreground">{c.car || "—"}</td>
                <td className="p-3 text-muted-foreground">{c.instagram || "—"}</td>
                <td className="p-3 text-right whitespace-nowrap">
                  <button onClick={()=>setEditing(c)} className="text-cc-cyan hover:text-cc-lime mr-3"><Edit2 size={16}/></button>
                  <button onClick={()=>confirm(`Delete "${c.name}"?`) && del.mutate(c.id)} className="text-destructive hover:text-cc-hot-pink"><Trash2 size={16}/></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {(editing || creating) && <CrewEditor member={editing} onClose={()=>{ setEditing(null); setCreating(false); }} />}
    </div>
  );
}

function CrewEditor({ member, onClose }: { member: CrewMember | null; onClose: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    name: member?.name || "",
    role: member?.role || "Driver",
    car: member?.car || "",
    bio: member?.bio || "",
    imageUrl: member?.imageUrl || "",
    instagram: member?.instagram || "",
    displayOrder: (member as any)?.displayOrder ?? 0,
  });
  const save = useMutation({
    mutationFn: async () => {
      if (member) return await apiRequest("PATCH", `/api/admin/crew/${member.id}`, form);
      return await apiRequest("POST", "/api/admin/crew", form);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/crew"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crew"] });
      toast({ title: member ? "Member updated" : "Member added" });
      onClose();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  return (
    <Modal title={member ? "EDIT MEMBER" : "NEW MEMBER"} onClose={onClose}>
      <form onSubmit={(e)=>{ e.preventDefault(); save.mutate(); }} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <AdminField label="Name" value={form.name} onChange={v=>setForm(f=>({...f,name:v}))} />
          <AdminField label="Role" value={form.role} onChange={v=>setForm(f=>({...f,role:v}))} />
          <AdminField label="Car" value={form.car} onChange={v=>setForm(f=>({...f,car:v}))} />
          <AdminField label="Instagram" value={form.instagram} onChange={v=>setForm(f=>({...f,instagram:v}))} />
          <AdminField label="Image URL" value={form.imageUrl} onChange={v=>setForm(f=>({...f,imageUrl:v}))} />
          <AdminField label="Sort order" type="number" value={form.displayOrder} onChange={v=>setForm(f=>({...f,displayOrder:parseInt(v)||0}))} />
        </div>
        <AdminField label="Bio" value={form.bio} onChange={v=>setForm(f=>({...f,bio:v}))} textarea />
        <button type="submit" disabled={save.isPending} className="w-full px-6 py-3 rounded-md btn-neon-lime disabled:opacity-60">
          {save.isPending ? "SAVING…" : "SAVE →"}
        </button>
      </form>
    </Modal>
  );
}

// -----------------------------------------------------------------------------
// Reusable admin components
// -----------------------------------------------------------------------------

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm grid place-items-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="w-full max-w-2xl bg-card border-2 border-cc-lime/60 rounded-2xl p-6 my-8" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h3 className="font-display font-extrabold text-2xl italic text-cc-lime cc-skew">{title}</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-cc-lime"><X /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function AdminField({ label, value, onChange, type="text", textarea=false, placeholder, ...rest }: any) {
  return (
    <div>
      <label className="block text-xs font-mono tracking-widest text-cc-cyan mb-1.5">{label.toUpperCase()}</label>
      {textarea ? (
        <textarea value={value} onChange={e=>onChange(e.target.value)} rows={3} className="w-full px-3 py-2.5 rounded-md bg-background border-2 border-cc-purple/40 focus:border-cc-lime focus:outline-none resize-none" placeholder={placeholder} {...rest} />
      ) : (
        <input type={type} value={value} onChange={e=>onChange(e.target.value)} className="w-full px-3 py-2.5 rounded-md bg-background border-2 border-cc-purple/40 focus:border-cc-lime focus:outline-none" placeholder={placeholder} {...rest} />
      )}
    </div>
  );
}
