import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Search, ShoppingCart, User, Package, MessageSquare, Home as HomeIcon,
  ShoppingBag, Plus, Minus, X, Check, Pencil, Trash2, LogOut, Settings as SettingsIcon,
  Users, FileText, BarChart3, Clock, ChevronRight, ChevronLeft, ArrowLeft, ShieldCheck, PiggyBank, Folder,
  Image as ImageIcon, Eye, EyeOff, AlertCircle, Loader2
} from "lucide-react";
import { supabase, usernameToEmail } from "./lib/supabaseClient";

/* ---------------------------------------------------------------------
   Living Stones Project
   A student-run charity storefront. Data lives in Supabase (Postgres +
   Auth), gated by Row Level Security — see supabase/schema.sql. Accounts
   only ever ask for a username + password; Supabase Auth's real password
   hashing happens under a generated e-mail the customer never sees.
   ------------------------------------------------------------------- */

const ADMIN_PHRASE = "iamanadminhehe472947T?!";
const FONTS_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@500&display=swap');
  .ls-display { font-family: 'Space Grotesk', sans-serif; }
  .ls-body { font-family: 'Inter', sans-serif; }
  .ls-mono { font-family: 'IBM Plex Mono', monospace; }
`;

const ORDER_STAGES = ["Order Placed", "Payment Confirmed", "Preparing", "In Production", "Ready", "Completed"];
const PAYMENT_STATUSES = ["Payment Pending", "Payment Received", "Payment Cancelled"];
const REQUEST_STATUSES = ["Submitted", "Reviewing", "Discussing", "Approved", "In Production", "Ready", "Completed", "Rejected"];
const CHIP_COLORS = [
  { bg: "#F3E4E1", text: "#8A5A52" }, // dusty rose
  { bg: "#DFE7EC", text: "#4E6B7A" }, // powder blue
  { bg: "#E8E3F0", text: "#6C5E8A" }, // soft lilac
  { bg: "#EFE6C8", text: "#8A7638" }, // muted gold
  { bg: "#E1E9E3", text: "#527058" }, // sage
];

function chipColor(seed) {
  const s = String(seed || "");
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return CHIP_COLORS[h % CHIP_COLORS.length];
}

function genId(prefix) {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function formatDate(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}

function formatMoney(n) {
  const v = Number(n) || 0;
  return `Rp${v.toLocaleString("id-ID")}`;
}

/* ------------------------- Supabase data layer ------------------------- */
/* Each loader fetches rows and maps snake_case DB columns to the camelCase
   shape the UI components below already expect, keyed by id — so none of
   the presentational components below had to change when the storage
   layer moved from window.storage to a real Postgres backend. */

function toDict(rows, mapFn) {
  const dict = {};
  (rows || []).forEach((r) => { const m = mapFn(r); dict[m.id] = m; });
  return dict;
}

async function loadProducts() {
  const { data } = await supabase.from("products").select("*").order("created_at", { ascending: false });
  return toDict(data, (p) => ({
    id: p.id, name: p.name, image: p.image, description: p.description,
    price: p.price, category: p.category, stock: p.stock, available: p.available,
  }));
}

async function loadThings() {
  const { data } = await supabase.from("things").select("*").order("date", { ascending: false });
  return toDict(data, (t) => ({
    id: t.id, title: t.title, coverImage: t.cover_image, content: t.content,
    photos: t.photos || [], videos: t.videos || [], date: t.date, author: t.author, published: t.published,
  }));
}

async function loadProfiles() {
  const { data } = await supabase.from("profiles").select("*");
  return toDict(data, (u) => ({ id: u.id, username: u.username, role: u.role, createdAt: u.created_at }));
}

async function loadSettings() {
  const { data } = await supabase.from("settings").select("*").eq("id", 1).maybeSingle();
  return { siteName: data?.site_name || "Living Stones Project" };
}

async function loadOrders() {
  const { data } = await supabase
    .from("orders")
    .select("*, order_items(*), order_status_history(*)")
    .order("created_at", { ascending: false });
  return toDict(data, (o) => ({
    id: o.id, username: o.username, total: o.total,
    paymentStatus: o.payment_status, stage: o.stage,
    adminNotes: o.admin_notes || "", estimatedCompletion: o.estimated_completion || "",
    createdAt: o.created_at,
    items: (o.order_items || []).map((it) => ({ productId: it.product_id, name: it.name, price: it.price, qty: it.qty, category: it.category })),
    statusHistory: (o.order_status_history || [])
      .slice()
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
      .map((h) => ({ stage: h.stage, timestamp: h.timestamp })),
  }));
}

async function loadRequests() {
  const { data } = await supabase.from("custom_requests").select("*").order("created_at", { ascending: false });
  return toDict(data, (r) => ({
    id: r.id, username: r.username, itemWanted: r.item_wanted, description: r.description,
    category: r.category, style: r.style, quantity: r.quantity, budget: r.budget,
    referenceImage: r.reference_image, notes: r.notes, status: r.status,
    adminResponse: r.admin_response || "", estimatedPrice: r.estimated_price || "", createdAt: r.created_at,
  }));
}

/* ------------------------------ atoms -------------------------------- */

function Btn({ children, onClick, variant = "primary", className = "", type = "button", disabled }) {
  const base = "inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
  const variants = {
    primary: "bg-stone-800 text-stone-50 hover:bg-stone-900",
    secondary: "bg-white text-stone-700 border border-stone-300 hover:bg-stone-100",
    ghost: "text-stone-600 hover:bg-stone-200/60",
    danger: "bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100",
    subtle: "bg-stone-200/70 text-stone-700 hover:bg-stone-300/70",
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`${base} ${variants[variant]} ${className}`}>
      {children}
    </button>
  );
}

function Input({ label, ...props }) {
  return (
    <label className="block">
      {label && <span className="ls-body mb-1 block text-xs font-medium text-stone-500">{label}</span>}
      <input
        {...props}
        className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800 placeholder-stone-400 outline-none focus:border-stone-500 focus:ring-2 focus:ring-stone-200"
      />
    </label>
  );
}

function TextArea({ label, ...props }) {
  return (
    <label className="block">
      {label && <span className="ls-body mb-1 block text-xs font-medium text-stone-500">{label}</span>}
      <textarea
        {...props}
        className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800 placeholder-stone-400 outline-none focus:border-stone-500 focus:ring-2 focus:ring-stone-200"
      />
    </label>
  );
}

function Select({ label, children, ...props }) {
  return (
    <label className="block">
      {label && <span className="ls-body mb-1 block text-xs font-medium text-stone-500">{label}</span>}
      <select
        {...props}
        className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800 outline-none focus:border-stone-500 focus:ring-2 focus:ring-stone-200"
      >
        {children}
      </select>
    </label>
  );
}

function Chip({ text }) {
  const c = chipColor(text);
  return (
    <span className="ls-body rounded-full px-2.5 py-0.5 text-xs font-medium" style={{ backgroundColor: c.bg, color: c.text }}>
      {text}
    </span>
  );
}

function Modal({ open, onClose, title, children, wide }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-stone-900/40 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className={`ls-body max-h-[92vh] w-full ${wide ? "sm:max-w-2xl" : "sm:max-w-md"} overflow-y-auto rounded-t-2xl bg-white sm:rounded-2xl`}>
        <div className="sticky top-0 flex items-center justify-between border-b border-stone-200 bg-white px-5 py-4">
          <h3 className="ls-display text-base font-semibold text-stone-800">{title}</h3>
          <button onClick={onClose} className="rounded-full p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700">
            <X size={18} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div className="fixed bottom-4 left-1/2 z-[60] -translate-x-1/2 rounded-xl bg-stone-800 px-4 py-2.5 text-sm text-stone-50 shadow-lg">
      {toast}
    </div>
  );
}

function EmptyState({ icon: Icon, title, sub }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-stone-300 py-16 text-center">
      <Icon size={28} className="mb-3 text-stone-400" />
      <p className="ls-display text-sm font-semibold text-stone-600">{title}</p>
      {sub && <p className="ls-body mt-1 max-w-xs text-xs text-stone-400">{sub}</p>}
    </div>
  );
}

/* --------------------- stone cairn progress tracker ------------------- */

function StoneCairn({ stage, statusHistory = [], size = "md" }) {
  const idx = Math.max(0, ORDER_STAGES.indexOf(stage));
  const dim = size === "sm" ? 18 : 26;
  return (
    <div className="ls-body flex flex-col gap-2">
      <div className="flex items-center">
        {ORDER_STAGES.map((s, i) => (
          <React.Fragment key={s}>
            <div className="flex flex-col items-center" style={{ width: dim + 10 }}>
              <div
                className="flex items-center justify-center rounded-full border-2 transition-colors"
                style={{
                  width: dim,
                  height: dim,
                  borderColor: i <= idx ? "#7C9885" : "#D9D5CE",
                  backgroundColor: i <= idx ? "#8FA593" : "#F5F5F4",
                }}
                title={s}
              >
                {i < idx && <Check size={dim * 0.55} color="white" />}
                {i === idx && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
              </div>
            </div>
            {i < ORDER_STAGES.length - 1 && (
              <div className="h-0.5 flex-1" style={{ backgroundColor: i < idx ? "#8FA593" : "#E2E1DE" }} />
            )}
          </React.Fragment>
        ))}
      </div>
      {size !== "sm" && (
        <div className="flex justify-between text-center">
          {ORDER_STAGES.map((s) => (
            <span key={s} className="ls-body w-16 text-[10px] leading-tight text-stone-500">{s}</span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------ header -------------------------------- */

function Header({ view, setView, currentUser, cartCount, onLogout, onSearch, onOpenAuth, onOpenCart }) {
  const [q, setQ] = useState("");
  const tabs = [
    { key: "home", label: "Home", icon: HomeIcon },
    { key: "shop", label: "Shop", icon: ShoppingBag },
    { key: "custom", label: "Custom Requests", icon: MessageSquare },
    { key: "things", label: "Things", icon: FileText },
    { key: "orders", label: "My Orders", icon: Package },
  ];
  return (
    <header className="sticky top-0 z-40 border-b border-stone-200 bg-stone-50/90 backdrop-blur">
      <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <button onClick={() => setView("home")} className="ls-display flex items-center gap-2 text-lg font-bold text-stone-800">
            <span className="flex h-8 w-8 items-center justify-center rounded-full" style={{ backgroundColor: "#8FA593" }}>
              <span className="ls-mono text-xs text-white">LS</span>
            </span>
            Living Stones
          </button>
          <div className="flex items-center gap-2">
            {currentUser ? (
              <>
                <span className="ls-body hidden text-xs text-stone-500 sm:inline">Hi, {currentUser.username}</span>
                <button onClick={onLogout} className="rounded-full p-2 text-stone-500 hover:bg-stone-200/70" title="Log out">
                  <LogOut size={18} />
                </button>
              </>
            ) : (
              <button onClick={onOpenAuth} className="rounded-full p-2 text-stone-500 hover:bg-stone-200/70" title="Log in / Sign up">
                <User size={18} />
              </button>
            )}
            <button onClick={onOpenCart} className="relative rounded-full p-2 text-stone-500 hover:bg-stone-200/70" title="Cart">
              <ShoppingCart size={18} />
              {cartCount > 0 && (
                <span className="ls-mono absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-400 px-1 text-[10px] text-white">
                  {cartCount}
                </span>
              )}
            </button>
          </div>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSearch(q);
            setQ("");
          }}
          className="relative"
        >
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search products…"
            className="ls-body w-full rounded-full border border-stone-300 bg-white py-2 pl-9 pr-3 text-sm text-stone-700 outline-none focus:border-stone-500 focus:ring-2 focus:ring-stone-200"
          />
        </form>

        <nav className="scrollbar-none -mx-1 flex gap-1 overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setView(t.key)}
              className={`ls-body flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                view === t.key ? "bg-stone-800 text-stone-50" : "text-stone-600 hover:bg-stone-200/70"
              }`}
            >
              <t.icon size={13} />
              {t.label}
            </button>
          ))}
        </nav>
      </div>
    </header>
  );
}

/* ------------------------------ auth modal ------------------------------ */

function AuthModal({ open, onClose, onLogin, onSignup, error }) {
  const [mode, setMode] = useState("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);

  useEffect(() => {
    if (open) {
      setUsername("");
      setPassword("");
      setMode("login");
    }
  }, [open]);

  return (
    <Modal open={open} onClose={onClose} title={mode === "login" ? "Log in" : "Create account"}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (mode === "login") onLogin(username.trim(), password);
          else onSignup(username.trim(), password);
        }}
        className="space-y-3"
      >
        <Input label="Username" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus required />
        <div className="relative">
          <Input
            label="Password"
            type={showPw ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button type="button" onClick={() => setShowPw((v) => !v)} className="absolute right-3 top-[30px] text-stone-400">
            {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>
        {error && (
          <p className="flex items-center gap-1.5 text-xs text-rose-600">
            <AlertCircle size={13} /> {error}
          </p>
        )}
        <p className="ls-body text-[11px] text-stone-400">Just a username and password — nothing else needed.</p>
        <Btn type="submit" className="w-full">
          {mode === "login" ? "Log in" : "Create account"}
        </Btn>
        <button
          type="button"
          onClick={() => setMode(mode === "login" ? "signup" : "login")}
          className="ls-body w-full text-center text-xs text-stone-500 hover:text-stone-700"
        >
          {mode === "login" ? "New here? Create an account" : "Already have an account? Log in"}
        </button>
      </form>
    </Modal>
  );
}

/* -------------------------------- home ---------------------------------- */

function HomeView({ setView, things, products }) {
  const latestThing = Object.values(things).filter((t) => t.published).sort((a, b) => new Date(b.date) - new Date(a.date))[0];
  const featured = Object.values(products).filter((p) => p.available).slice(0, 3);
  return (
    <div className="space-y-8">
      <section
        className="ls-display relative overflow-hidden rounded-3xl px-6 py-12 text-center sm:py-16"
        style={{ background: "linear-gradient(160deg, #EDEBE6 0%, #E4E9E5 60%, #DCE4DF 100%)" }}
      >
        <p className="ls-body mb-3 text-xs font-semibold uppercase tracking-widest text-stone-500">Student-run · Every sale gives back</p>
        <h1 className="mx-auto max-w-md text-3xl font-bold leading-tight text-stone-800 sm:text-4xl">
          Small stones. Stacked together, they hold something up.
        </h1>
        <p className="ls-body mx-auto mt-3 max-w-sm text-sm text-stone-600">
          We make and sell things, then put every bit of profit toward our chosen cause. Browse the shop, or ask us to make something just for you.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Btn onClick={() => setView("shop")}>Browse the shop</Btn>
          <Btn variant="secondary" onClick={() => setView("custom")}>Request something custom</Btn>
        </div>
      </section>

      {featured.length > 0 && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="ls-display text-sm font-semibold text-stone-700">From the shop</h2>
            <button onClick={() => setView("shop")} className="ls-body flex items-center text-xs text-stone-500 hover:text-stone-700">
              See all <ChevronRight size={14} />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {featured.map((p) => (
              <div key={p.id} className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
                <div className="aspect-square w-full bg-stone-100">
                  {p.image ? <img src={p.image} alt={p.name} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-stone-300"><ImageIcon /></div>}
                </div>
                <div className="p-2.5">
                  <p className="ls-body truncate text-xs font-medium text-stone-700">{p.name}</p>
                  <p className="ls-mono text-xs text-stone-500">{formatMoney(p.price)}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {latestThing && (
        <section>
          <h2 className="ls-display mb-3 text-sm font-semibold text-stone-700">Latest update</h2>
          <button
            onClick={() => setView("things")}
            className="flex w-full items-center gap-3 rounded-2xl border border-stone-200 bg-white p-3 text-left hover:bg-stone-50"
          >
            <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-stone-100">
              {latestThing.coverImage ? <img src={latestThing.coverImage} className="h-full w-full object-cover" /> : null}
            </div>
            <div className="min-w-0">
              <p className="ls-body truncate text-sm font-semibold text-stone-700">{latestThing.title}</p>
              <p className="ls-body text-xs text-stone-400">{formatDate(latestThing.date)} · {latestThing.author}</p>
            </div>
          </button>
        </section>
      )}
    </div>
  );
}

/* -------------------------------- shop ----------------------------------- */

function ProductModal({ product, open, onClose, onAdd }) {
  const [qty, setQty] = useState(1);
  useEffect(() => setQty(1), [product]);
  if (!product) return null;
  const outOfStock = !product.available || product.stock <= 0;
  return (
    <Modal open={open} onClose={onClose} title={product.name} wide>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="aspect-square overflow-hidden rounded-xl bg-stone-100">
          {product.image ? <img src={product.image} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-stone-300"><ImageIcon size={32} /></div>}
        </div>
        <div className="space-y-3">
          <Chip text={product.category || "Uncategorized"} />
          <p className="ls-display text-xl font-bold text-stone-800">{formatMoney(product.price)}</p>
          <p className="ls-body whitespace-pre-line text-sm text-stone-600">{product.description}</p>
          <p className="ls-body text-xs text-stone-400">{outOfStock ? "Out of stock" : `${product.stock} in stock`}</p>
          {!outOfStock && (
            <div className="flex items-center gap-2">
              <div className="flex items-center rounded-full border border-stone-300">
                <button onClick={() => setQty((q) => Math.max(1, q - 1))} className="p-2 text-stone-500"><Minus size={14} /></button>
                <span className="ls-mono w-8 text-center text-sm">{qty}</span>
                <button onClick={() => setQty((q) => Math.min(product.stock, q + 1))} className="p-2 text-stone-500"><Plus size={14} /></button>
              </div>
              <Btn onClick={() => { onAdd(product, qty); onClose(); }} className="flex-1">
                Add to cart
              </Btn>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

function CartDrawer({ open, onClose, cart, products, onQty, onRemove, onCheckout, currentUser }) {
  const items = Object.entries(cart).map(([id, qty]) => ({ product: products[id], qty })).filter((i) => i.product);
  const total = items.reduce((s, i) => s + i.product.price * i.qty, 0);
  return (
    <Modal open={open} onClose={onClose} title="Your cart" wide>
      {items.length === 0 ? (
        <EmptyState icon={ShoppingCart} title="Your cart is empty" sub="Add something from the shop." />
      ) : (
        <div className="space-y-3">
          {items.map(({ product, qty }) => (
            <div key={product.id} className="flex items-center gap-3 rounded-xl border border-stone-200 p-2.5">
              <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-stone-100">
                {product.image && <img src={product.image} className="h-full w-full object-cover" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="ls-body truncate text-sm font-medium text-stone-700">{product.name}</p>
                <p className="ls-mono text-xs text-stone-500">{formatMoney(product.price)}</p>
              </div>
              <div className="flex items-center rounded-full border border-stone-300">
                <button onClick={() => onQty(product.id, Math.max(1, qty - 1))} className="p-1.5 text-stone-500"><Minus size={12} /></button>
                <span className="ls-mono w-6 text-center text-xs">{qty}</span>
                <button onClick={() => onQty(product.id, Math.min(product.stock, qty + 1))} className="p-1.5 text-stone-500"><Plus size={12} /></button>
              </div>
              <button onClick={() => onRemove(product.id)} className="p-1.5 text-stone-400 hover:text-rose-500"><Trash2 size={15} /></button>
            </div>
          ))}
          <div className="flex items-center justify-between border-t border-stone-200 pt-3">
            <span className="ls-body text-sm font-medium text-stone-600">Total</span>
            <span className="ls-display text-lg font-bold text-stone-800">{formatMoney(total)}</span>
          </div>
          <Btn className="w-full" onClick={onCheckout}>
            {currentUser ? "Place order" : "Log in to place order"}
          </Btn>
          <p className="ls-body text-center text-[11px] text-stone-400">Payment is handled offline — you'll get an order number and instructions after placing your order.</p>
        </div>
      )}
    </Modal>
  );
}

function ShopView({ products, cart, onAdd, onOpenCart, initialSearch }) {
  const [category, setCategory] = useState("All");
  const [query, setQuery] = useState(initialSearch || "");
  const [selected, setSelected] = useState(null);
  useEffect(() => setQuery(initialSearch || ""), [initialSearch]);

  const list = Object.values(products).filter((p) => p.available !== false);
  const categories = ["All", ...Array.from(new Set(list.map((p) => p.category).filter(Boolean)))];
  const filtered = list.filter(
    (p) => (category === "All" || p.category === category) && (!query || p.name.toLowerCase().includes(query.toLowerCase()))
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="ls-display text-xl font-bold text-stone-800">Shop</h1>
        {query && <span className="ls-body text-xs text-stone-400">Results for "{query}"</span>}
      </div>
      <div className="-mx-1 flex gap-1.5 overflow-x-auto pb-1">
        {categories.map((c) => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={`ls-body shrink-0 rounded-full px-3 py-1 text-xs font-medium ${
              category === c ? "bg-stone-800 text-white" : "bg-white text-stone-600 border border-stone-300"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={ShoppingBag} title="No products yet" sub="Check back soon — new items are on the way." />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {filtered.map((p) => (
            <button key={p.id} onClick={() => setSelected(p)} className="overflow-hidden rounded-2xl border border-stone-200 bg-white text-left transition-shadow hover:shadow-md">
              <div className="relative aspect-square w-full bg-stone-100">
                {p.image ? <img src={p.image} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-stone-300"><ImageIcon /></div>}
                {p.stock <= 0 && (
                  <span className="ls-body absolute right-2 top-2 rounded-full bg-stone-800/80 px-2 py-0.5 text-[10px] text-white">Out of stock</span>
                )}
              </div>
              <div className="space-y-1 p-2.5">
                <Chip text={p.category || "Uncategorized"} />
                <p className="ls-body truncate text-sm font-medium text-stone-700">{p.name}</p>
                <p className="ls-mono text-xs text-stone-500">{formatMoney(p.price)}</p>
              </div>
            </button>
          ))}
        </div>
      )}

      <ProductModal product={selected} open={!!selected} onClose={() => setSelected(null)} onAdd={onAdd} />
    </div>
  );
}

/* --------------------------- custom requests ------------------------------ */

function CustomRequestsView({ currentUser, requests, onSubmit, onOpenAuth }) {
  const [form, setForm] = useState({
    itemWanted: "", description: "", category: "", style: "", quantity: 1, budget: "", referenceImage: "", notes: "",
  });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const myRequests = currentUser ? Object.values(requests).filter((r) => r.username === currentUser.username).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)) : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="ls-display text-xl font-bold text-stone-800">Custom Requests</h1>
        <p className="ls-body mt-1 text-sm text-stone-500">Tell us what you're picturing — we'll get back to you with pricing and timing.</p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!currentUser) { onOpenAuth(); return; }
          onSubmit(form);
          setForm({ itemWanted: "", description: "", category: "", style: "", quantity: 1, budget: "", referenceImage: "", notes: "" });
        }}
        className="space-y-3 rounded-2xl border border-stone-200 bg-white p-4"
      >
        <Input label="What do you want?" value={form.itemWanted} onChange={set("itemWanted")} required />
        <TextArea label="Description" rows={3} value={form.description} onChange={set("description")} required />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Category" value={form.category} onChange={set("category")} />
          <Input label="Preferred colors / style" value={form.style} onChange={set("style")} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Quantity" type="number" min="1" value={form.quantity} onChange={set("quantity")} />
          <Input label="Budget" value={form.budget} onChange={set("budget")} placeholder="Rp..." />
        </div>
        <Input label="Reference image (URL, optional)" value={form.referenceImage} onChange={set("referenceImage")} placeholder="https://..." />
        <TextArea label="Additional notes" rows={2} value={form.notes} onChange={set("notes")} />
        <Btn type="submit" className="w-full">{currentUser ? "Submit request" : "Log in to submit"}</Btn>
      </form>

      {currentUser && (
        <div>
          <h2 className="ls-display mb-3 text-sm font-semibold text-stone-700">Your requests</h2>
          {myRequests.length === 0 ? (
            <EmptyState icon={MessageSquare} title="No requests yet" />
          ) : (
            <div className="space-y-2">
              {myRequests.map((r) => (
                <div key={r.id} className="rounded-xl border border-stone-200 bg-white p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="ls-body truncate text-sm font-medium text-stone-700">{r.itemWanted}</p>
                      <p className="ls-body text-xs text-stone-400">{formatDate(r.createdAt)}</p>
                    </div>
                    <span className="ls-body shrink-0 rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-medium text-stone-600">{r.status}</span>
                  </div>
                  {r.estimatedPrice && <p className="ls-mono mt-1 text-xs text-stone-500">Estimated: {formatMoney(r.estimatedPrice)}</p>}
                  {r.adminResponse && <p className="ls-body mt-2 rounded-lg bg-stone-50 p-2 text-xs text-stone-600">{r.adminResponse}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* -------------------------------- things ---------------------------------- */

function ThingsView({ things }) {
  const [open, setOpen] = useState(null);
  const posts = Object.values(things).filter((t) => t.published).sort((a, b) => new Date(b.date) - new Date(a.date));
  return (
    <div className="space-y-4">
      <h1 className="ls-display text-xl font-bold text-stone-800">Things</h1>
      {posts.length === 0 ? (
        <EmptyState icon={FileText} title="Nothing posted yet" sub="Updates and behind-the-scenes posts will show up here." />
      ) : (
        <div className="space-y-3">
          {posts.map((t) => (
            <button key={t.id} onClick={() => setOpen(t)} className="flex w-full gap-3 rounded-2xl border border-stone-200 bg-white p-3 text-left hover:bg-stone-50">
              <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-stone-100">
                {t.coverImage ? <img src={t.coverImage} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-stone-300"><ImageIcon /></div>}
              </div>
              <div className="min-w-0">
                <p className="ls-body font-semibold text-stone-700">{t.title}</p>
                <p className="ls-body text-xs text-stone-400">{formatDate(t.date)} · {t.author}</p>
                <p className="ls-body mt-1 line-clamp-2 text-xs text-stone-500">{t.content}</p>
              </div>
            </button>
          ))}
        </div>
      )}
      <Modal open={!!open} onClose={() => setOpen(null)} title={open?.title || ""} wide>
        {open && (
          <div className="space-y-3">
            {open.coverImage && <img src={open.coverImage} className="w-full rounded-xl" />}
            <p className="ls-body text-xs text-stone-400">{formatDate(open.date)} · {open.author}</p>
            <p className="ls-body whitespace-pre-line text-sm text-stone-600">{open.content}</p>
            {(open.photos || []).map((src, i) => <img key={i} src={src} className="w-full rounded-xl" />)}
            {(open.videos || []).map((src, i) => <video key={i} src={src} controls className="w-full rounded-xl" />)}
          </div>
        )}
      </Modal>
    </div>
  );
}

/* -------------------------------- my orders --------------------------------- */

function MyOrdersView({ currentUser, orders, onOpenAuth }) {
  const [open, setOpen] = useState(null);
  if (!currentUser) {
    return <EmptyState icon={Package} title="Log in to see your orders" sub="Your order history is tied to your account." />;
  }
  const mine = Object.values(orders).filter((o) => o.username === currentUser.username).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return (
    <div className="space-y-4">
      <h1 className="ls-display text-xl font-bold text-stone-800">My Orders</h1>
      {mine.length === 0 ? (
        <EmptyState icon={Package} title="No orders yet" sub="Anything you order from the shop will show up here." />
      ) : (
        <div className="space-y-2">
          {mine.map((o) => (
            <button key={o.id} onClick={() => setOpen(o)} className="w-full rounded-xl border border-stone-200 bg-white p-3 text-left hover:bg-stone-50">
              <div className="flex items-center justify-between">
                <span className="ls-mono text-xs text-stone-500">{o.id}</span>
                <span className="ls-body rounded-full bg-stone-100 px-2.5 py-0.5 text-[11px] font-medium text-stone-600">{o.paymentStatus}</span>
              </div>
              <p className="ls-body mt-1 text-sm text-stone-700">{o.items.length} item{o.items.length !== 1 ? "s" : ""} · {formatMoney(o.total)}</p>
              <div className="mt-2"><StoneCairn stage={o.stage} size="sm" /></div>
            </button>
          ))}
        </div>
      )}
      <Modal open={!!open} onClose={() => setOpen(null)} title={open?.id || ""} wide>
        {open && (
          <div className="space-y-4">
            <StoneCairn stage={open.stage} />
            <div className="space-y-1.5">
              {open.items.map((it, i) => (
                <div key={i} className="flex justify-between text-sm text-stone-600">
                  <span>{it.name} × {it.qty}</span>
                  <span className="ls-mono">{formatMoney(it.price * it.qty)}</span>
                </div>
              ))}
              <div className="flex justify-between border-t border-stone-200 pt-1.5 text-sm font-semibold text-stone-800">
                <span>Total</span><span className="ls-mono">{formatMoney(open.total)}</span>
              </div>
            </div>
            <p className="ls-body text-xs text-stone-500">Payment status: <span className="font-medium text-stone-700">{open.paymentStatus}</span></p>
            {open.estimatedCompletion && <p className="ls-body text-xs text-stone-500">Estimated completion: {formatDate(open.estimatedCompletion)}</p>}
            <div>
              <p className="ls-body mb-1 text-xs font-medium text-stone-500">History</p>
              <div className="space-y-1">
                {(open.statusHistory || []).map((h, i) => (
                  <div key={i} className="ls-body flex justify-between text-xs text-stone-500">
                    <span>{h.stage}</span><span>{formatDate(h.timestamp)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

/* -------------------------------------------------------------------------
   ADMIN MANAGER
   ------------------------------------------------------------------------- */

function AdminDashboard({ orders, requests, products, users }) {
  const orderList = Object.values(orders);
  const paidOrders = orderList.filter((o) => o.paymentStatus === "Payment Received");
  const totalRaised = paidOrders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);

  // Both breakdowns below are built from paid orders only, same rule as
  // "Total raised" — a fake/test purchase only skews these if it's marked
  // Payment Received; deleting the order (or setting it to Cancelled) fixes it.
  const categoryTotals = {};
  const productTotals = {};
  paidOrders.forEach((o) => {
    (o.items || []).forEach((it) => {
      const cat = it.category || "Uncategorized";
      const lineTotal = (Number(it.price) || 0) * (Number(it.qty) || 0);
      categoryTotals[cat] = (categoryTotals[cat] || 0) + lineTotal;
      if (!productTotals[it.name]) productTotals[it.name] = { name: it.name, qty: 0, revenue: 0 };
      productTotals[it.name].qty += Number(it.qty) || 0;
      productTotals[it.name].revenue += lineTotal;
    });
  });
  const categories = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1]);
  const topProducts = Object.values(productTotals).sort((a, b) => b.revenue - a.revenue).slice(0, 5);

  const stats = [
    { label: "Orders", value: orderList.length, icon: Package },
    { label: "Pending payments", value: orderList.filter((o) => o.paymentStatus === "Payment Pending").length, icon: Clock },
    { label: "Open requests", value: Object.values(requests).filter((r) => !["Completed", "Rejected"].includes(r.status)).length, icon: MessageSquare },
    { label: "Products", value: Object.keys(products).length, icon: ShoppingBag },
    { label: "Customers", value: Object.values(users).filter((u) => u.role === "customer").length, icon: Users },
  ];

  return (
    <div className="space-y-5">
      {/* Money counter — admin dashboard only, never rendered anywhere in the
          customer-facing views. Counts orders marked "Payment Received" only,
          since that's money actually in hand rather than just placed. */}
      <div className="rounded-2xl p-5 text-white" style={{ background: "linear-gradient(135deg, #7C9885 0%, #8FA593 100%)" }}>
        <div className="flex items-center gap-2 opacity-90">
          <PiggyBank size={16} />
          <span className="ls-body text-xs font-medium uppercase tracking-wide">Total raised</span>
        </div>
        <p className="ls-display mt-1 text-3xl font-bold">{formatMoney(totalRaised)}</p>
        <p className="ls-body mt-1 text-xs opacity-80">
          from {paidOrders.length} paid order{paidOrders.length !== 1 ? "s" : ""}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {stats.map((s) => (
          <div key={s.label} className="rounded-2xl border border-stone-200 bg-white p-4">
            <s.icon size={16} className="mb-2 text-stone-400" />
            <p className="ls-display text-2xl font-bold text-stone-800">{s.value}</p>
            <p className="ls-body text-xs text-stone-500">{s.label}</p>
          </div>
        ))}
      </div>

      {categories.length > 0 && (
        <div>
          <h3 className="ls-display mb-2 flex items-center gap-1.5 text-sm font-semibold text-stone-700">
            <Folder size={14} /> Raised by category
          </h3>
          <div className="space-y-2">
            {categories.map(([cat, amount]) => (
              <div key={cat} className="flex items-center justify-between rounded-xl border border-stone-200 bg-white p-3">
                <div className="flex items-center gap-2">
                  <Folder size={15} className="text-stone-400" />
                  <Chip text={cat} />
                </div>
                <span className="ls-mono text-sm font-semibold text-stone-700">{formatMoney(amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {topProducts.length > 0 && (
        <div>
          <h3 className="ls-display mb-2 text-sm font-semibold text-stone-700">Top sellers</h3>
          <div className="space-y-2">
            {topProducts.map((p, i) => (
              <div key={p.name} className="flex items-center justify-between rounded-xl border border-stone-200 bg-white p-3">
                <div className="flex items-center gap-2">
                  <span className="ls-mono text-xs text-stone-400">#{i + 1}</span>
                  <span className="ls-body text-sm text-stone-700">{p.name}</span>
                </div>
                <div className="text-right">
                  <p className="ls-mono text-sm font-semibold text-stone-700">{formatMoney(p.revenue)}</p>
                  <p className="ls-body text-[11px] text-stone-400">{p.qty} sold</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}


function AdminProducts({ products, onSave, onDelete }) {
  const [editing, setEditing] = useState(null);
  const blank = { name: "", image: "", description: "", price: "", category: "", stock: "", available: true };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="ls-display text-sm font-semibold text-stone-700">Products</h2>
        <Btn onClick={() => setEditing({ ...blank })}><Plus size={14} /> Add product</Btn>
      </div>
      {Object.keys(products).length === 0 ? (
        <EmptyState icon={ShoppingBag} title="No products yet" sub="Add your first product to open the shop." />
      ) : (
        <div className="space-y-2">
          {Object.values(products).map((p) => (
            <div key={p.id} className="flex items-center gap-3 rounded-xl border border-stone-200 bg-white p-2.5">
              <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-stone-100">
                {p.image && <img src={p.image} className="h-full w-full object-cover" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="ls-body truncate text-sm font-medium text-stone-700">{p.name}</p>
                <p className="ls-mono text-xs text-stone-500">{formatMoney(p.price)} · stock {p.stock}</p>
              </div>
              <span className={`ls-body rounded-full px-2 py-0.5 text-[10px] font-medium ${p.available ? "bg-emerald-50 text-emerald-600" : "bg-stone-100 text-stone-400"}`}>
                {p.available ? "Visible" : "Hidden"}
              </span>
              <button onClick={() => setEditing(p)} className="p-1.5 text-stone-400 hover:text-stone-700"><Pencil size={15} /></button>
              <button onClick={() => onDelete(p.id)} className="p-1.5 text-stone-400 hover:text-rose-500"><Trash2 size={15} /></button>
            </div>
          ))}
        </div>
      )}

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? "Edit product" : "Add product"} wide>
        {editing && (
          <form
            onSubmit={(e) => { e.preventDefault(); onSave(editing); setEditing(null); }}
            className="space-y-3"
          >
            <Input label="Name" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} required />
            <Input label="Image URL" value={editing.image} onChange={(e) => setEditing({ ...editing, image: e.target.value })} placeholder="https://..." />
            <TextArea label="Description" rows={3} value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Price (Rp)" type="number" value={editing.price} onChange={(e) => setEditing({ ...editing, price: e.target.value })} required />
              <Input label="Category" value={editing.category} onChange={(e) => setEditing({ ...editing, category: e.target.value })} />
            </div>
            <Input label="Stock" type="number" value={editing.stock} onChange={(e) => setEditing({ ...editing, stock: e.target.value })} required />
            <label className="flex items-center gap-2 text-sm text-stone-600">
              <input type="checkbox" checked={editing.available} onChange={(e) => setEditing({ ...editing, available: e.target.checked })} />
              Visible in shop
            </label>
            <Btn type="submit" className="w-full">Save product</Btn>
          </form>
        )}
      </Modal>
    </div>
  );
}

function AdminOrders({ orders, onUpdate, onStageChange, onDelete }) {
  const [open, setOpen] = useState(null);
  const list = Object.values(orders).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return (
    <div className="space-y-3">
      <h2 className="ls-display text-sm font-semibold text-stone-700">Orders</h2>
      {list.length === 0 ? <EmptyState icon={Package} title="No orders yet" /> : (
        <div className="space-y-2">
          {list.map((o) => (
            <button key={o.id} onClick={() => setOpen(o)} className="w-full rounded-xl border border-stone-200 bg-white p-3 text-left hover:bg-stone-50">
              <div className="flex items-center justify-between">
                <span className="ls-mono text-xs text-stone-500">{o.id}</span>
                <span className="ls-body text-xs text-stone-400">{o.username}</span>
              </div>
              <div className="mt-1 flex items-center justify-between">
                <span className="ls-body text-xs font-medium text-stone-600">{o.stage}</span>
                <span className="ls-body text-xs text-stone-500">{o.paymentStatus}</span>
              </div>
            </button>
          ))}
        </div>
      )}
      <Modal open={!!open} onClose={() => setOpen(null)} title={open?.id || ""} wide>
        {open && (
          <AdminOrderDetail
            order={open}
            onUpdate={(patch) => { onUpdate(open.id, patch); setOpen({ ...open, ...patch }); }}
            onStageChange={(stage) => {
              onStageChange(open.id, stage);
              setOpen({ ...open, stage, statusHistory: [...(open.statusHistory || []), { stage, timestamp: new Date().toISOString() }] });
            }}
            onDelete={(id) => { onDelete(id); setOpen(null); }}
          />
        )}
      </Modal>
    </div>
  );
}

function AdminOrderDetail({ order, onUpdate, onStageChange, onDelete }) {
  const [notes, setNotes] = useState(order.adminNotes || "");
  const [est, setEst] = useState(order.estimatedCompletion || "");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        {order.items.map((it, i) => (
          <div key={i} className="flex justify-between text-sm text-stone-600">
            <span>{it.name} × {it.qty}</span><span className="ls-mono">{formatMoney(it.price * it.qty)}</span>
          </div>
        ))}
        <div className="flex justify-between border-t border-stone-200 pt-1.5 text-sm font-semibold text-stone-800">
          <span>Total</span><span className="ls-mono">{formatMoney(order.total)}</span>
        </div>
      </div>
      <Select label="Payment status" value={order.paymentStatus} onChange={(e) => onUpdate({ paymentStatus: e.target.value })}>
        {PAYMENT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
      </Select>
      <Select label="Order stage" value={order.stage} onChange={(e) => onStageChange(e.target.value)}>
        {ORDER_STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
      </Select>
      <Input label="Estimated completion" type="date" value={est} onChange={(e) => setEst(e.target.value)} onBlur={() => onUpdate({ estimatedCompletion: est })} />
      <TextArea label="Internal notes (not visible to customer)" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => onUpdate({ adminNotes: notes })} />

      <div className="border-t border-stone-200 pt-3">
        {!confirmingDelete ? (
          <button onClick={() => setConfirmingDelete(true)} className="ls-body flex w-full items-center justify-center gap-1.5 text-xs text-stone-400 hover:text-rose-500">
            <Trash2 size={13} /> Delete this order (e.g. a test purchase)
          </button>
        ) : (
          <div className="space-y-2 rounded-xl border border-rose-200 bg-rose-50 p-3">
            <p className="ls-body text-center text-xs text-rose-700">This can't be undone. Delete order {order.id}?</p>
            <div className="flex gap-2">
              <Btn variant="secondary" className="flex-1" onClick={() => setConfirmingDelete(false)}>Cancel</Btn>
              <Btn variant="danger" className="flex-1" onClick={() => onDelete(order.id)}>Yes, delete it</Btn>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function AdminRequests({ requests, onUpdate }) {
  const [open, setOpen] = useState(null);
  const list = Object.values(requests).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return (
    <div className="space-y-3">
      <h2 className="ls-display text-sm font-semibold text-stone-700">Custom Requests</h2>
      {list.length === 0 ? <EmptyState icon={MessageSquare} title="No requests yet" /> : (
        <div className="space-y-2">
          {list.map((r) => (
            <button key={r.id} onClick={() => setOpen(r)} className="w-full rounded-xl border border-stone-200 bg-white p-3 text-left hover:bg-stone-50">
              <div className="flex items-center justify-between">
                <span className="ls-body truncate text-sm font-medium text-stone-700">{r.itemWanted}</span>
                <span className="ls-body shrink-0 rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-medium text-stone-600">{r.status}</span>
              </div>
              <p className="ls-body text-xs text-stone-400">from {r.username}</p>
            </button>
          ))}
        </div>
      )}
      <Modal open={!!open} onClose={() => setOpen(null)} title={open?.itemWanted || ""} wide>
        {open && <AdminRequestDetail request={open} onUpdate={(patch) => { onUpdate(open.id, patch); setOpen({ ...open, ...patch }); }} />}
      </Modal>
    </div>
  );
}

function AdminRequestDetail({ request, onUpdate }) {
  const [response, setResponse] = useState(request.adminResponse || "");
  const [price, setPrice] = useState(request.estimatedPrice || "");
  return (
    <div className="space-y-3">
      <p className="ls-body text-sm text-stone-600">{request.description}</p>
      <div className="ls-body grid grid-cols-2 gap-2 text-xs text-stone-500">
        <span>Category: {request.category || "—"}</span>
        <span>Style: {request.style || "—"}</span>
        <span>Qty: {request.quantity}</span>
        <span>Budget: {request.budget || "—"}</span>
      </div>
      {request.referenceImage && <img src={request.referenceImage} className="w-full rounded-xl" />}
      {request.notes && <p className="ls-body rounded-lg bg-stone-50 p-2 text-xs text-stone-500">{request.notes}</p>}
      <Select label="Status" value={request.status} onChange={(e) => onUpdate({ status: e.target.value })}>
        {REQUEST_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
      </Select>
      <Input label="Estimated price (Rp)" type="number" value={price} onChange={(e) => setPrice(e.target.value)} onBlur={() => onUpdate({ estimatedPrice: price })} />
      <TextArea label="Response to customer" rows={2} value={response} onChange={(e) => setResponse(e.target.value)} onBlur={() => onUpdate({ adminResponse: response })} />
      <div className="flex gap-2">
        <Btn variant="secondary" className="flex-1" onClick={() => onUpdate({ status: "Approved" })}>Approve</Btn>
        <Btn variant="danger" className="flex-1" onClick={() => onUpdate({ status: "Rejected" })}>Reject</Btn>
        <Btn variant="subtle" className="flex-1" onClick={() => onUpdate({ status: "Completed" })}>Mark done</Btn>
      </div>
    </div>
  );
}

function AdminThings({ things, onSave, onDelete }) {
  const [editing, setEditing] = useState(null);
  const blank = { title: "", coverImage: "", content: "", photos: "", videos: "", date: new Date().toISOString().slice(0, 10), author: "", published: false };
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="ls-display text-sm font-semibold text-stone-700">Things</h2>
        <Btn onClick={() => setEditing({ ...blank })}><Plus size={14} /> New post</Btn>
      </div>
      {Object.keys(things).length === 0 ? <EmptyState icon={FileText} title="No posts yet" /> : (
        <div className="space-y-2">
          {Object.values(things).map((t) => (
            <div key={t.id} className="flex items-center gap-3 rounded-xl border border-stone-200 bg-white p-2.5">
              <div className="min-w-0 flex-1">
                <p className="ls-body truncate text-sm font-medium text-stone-700">{t.title}</p>
                <p className="ls-body text-xs text-stone-400">{formatDate(t.date)}</p>
              </div>
              <span className={`ls-body rounded-full px-2 py-0.5 text-[10px] font-medium ${t.published ? "bg-emerald-50 text-emerald-600" : "bg-stone-100 text-stone-400"}`}>
                {t.published ? "Published" : "Draft"}
              </span>
              <button onClick={() => setEditing({ ...t, photos: (t.photos || []).join("\n"), videos: (t.videos || []).join("\n") })} className="p-1.5 text-stone-400 hover:text-stone-700"><Pencil size={15} /></button>
              <button onClick={() => onDelete(t.id)} className="p-1.5 text-stone-400 hover:text-rose-500"><Trash2 size={15} /></button>
            </div>
          ))}
        </div>
      )}
      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? "Edit post" : "New post"} wide>
        {editing && (
          <form onSubmit={(e) => e.preventDefault()} className="space-y-3">
            <Input label="Title" value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} required />
            <Input label="Cover image URL" value={editing.coverImage} onChange={(e) => setEditing({ ...editing, coverImage: e.target.value })} />
            <TextArea label="Content" rows={4} value={editing.content} onChange={(e) => setEditing({ ...editing, content: e.target.value })} />
            <TextArea label="Photo URLs (one per line)" rows={2} value={editing.photos} onChange={(e) => setEditing({ ...editing, photos: e.target.value })} />
            <TextArea label="Video URLs (one per line)" rows={2} value={editing.videos} onChange={(e) => setEditing({ ...editing, videos: e.target.value })} />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Date" type="date" value={editing.date} onChange={(e) => setEditing({ ...editing, date: e.target.value })} />
              <Input label="Author" value={editing.author} onChange={(e) => setEditing({ ...editing, author: e.target.value })} />
            </div>
            <div className="flex gap-2">
              <Btn
                type="button"
                variant="secondary"
                className="flex-1"
                onClick={() => {
                  onSave({
                    ...editing,
                    published: false,
                    photos: editing.photos ? editing.photos.split("\n").map((s) => s.trim()).filter(Boolean) : [],
                    videos: editing.videos ? editing.videos.split("\n").map((s) => s.trim()).filter(Boolean) : [],
                  });
                  setEditing(null);
                }}
              >
                Save draft
              </Btn>
              <Btn
                type="button"
                className="flex-1"
                onClick={() => {
                  onSave({
                    ...editing,
                    published: true,
                    photos: editing.photos ? editing.photos.split("\n").map((s) => s.trim()).filter(Boolean) : [],
                    videos: editing.videos ? editing.videos.split("\n").map((s) => s.trim()).filter(Boolean) : [],
                  });
                  setEditing(null);
                }}
              >
                Publish
              </Btn>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}

function AdminCustomers({ users, orders }) {
  const list = Object.values(users);
  return (
    <div className="space-y-3">
      <h2 className="ls-display text-sm font-semibold text-stone-700">Customers</h2>
      <div className="space-y-2">
        {list.map((u) => (
          <div key={u.username} className="flex items-center justify-between rounded-xl border border-stone-200 bg-white p-3">
            <div>
              <p className="ls-body text-sm font-medium text-stone-700">{u.username}</p>
              <p className="ls-body text-xs text-stone-400">Joined {formatDate(u.createdAt)}</p>
            </div>
            <div className="text-right">
              <span className="ls-body block text-xs font-medium capitalize text-stone-600">{u.role}</span>
              <span className="ls-body text-xs text-stone-400">{Object.values(orders).filter((o) => o.username === u.username).length} orders</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AdminManagement({ users, currentUser, onSetRole }) {
  const isOwner = currentUser.role === "owner";
  return (
    <div className="space-y-3">
      <h2 className="ls-display text-sm font-semibold text-stone-700">Admin Management</h2>
      {!isOwner && <p className="ls-body text-xs text-stone-500">Only the Owner can change roles. You're signed in as {currentUser.role}.</p>}
      <div className="space-y-2">
        {Object.values(users).map((u) => (
          <div key={u.username} className="flex items-center justify-between rounded-xl border border-stone-200 bg-white p-3">
            <span className="ls-body text-sm font-medium text-stone-700">{u.username}</span>
            {isOwner ? (
              <Select value={u.role} onChange={(e) => onSetRole(u.username, e.target.value)} className="!w-auto">
                <option value="customer">Customer</option>
                <option value="admin">Admin</option>
                <option value="owner">Owner</option>
              </Select>
            ) : (
              <span className="ls-body text-xs capitalize text-stone-500">{u.role}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function AdminSettings({ settings, onSave }) {
  const [siteName, setSiteName] = useState(settings.siteName || "Living Stones Project");
  return (
    <div className="max-w-sm space-y-3">
      <h2 className="ls-display text-sm font-semibold text-stone-700">Settings</h2>
      <Input label="Site name" value={siteName} onChange={(e) => setSiteName(e.target.value)} />
      <Btn onClick={() => onSave({ ...settings, siteName })}>Save</Btn>
    </div>
  );
}

function AdminManager({ data, actions, currentUser, onExit }) {
  const [tab, setTab] = useState("dashboard");
  const tabs = [
    { key: "dashboard", label: "Dashboard", icon: BarChart3 },
    { key: "products", label: "Products", icon: ShoppingBag },
    { key: "orders", label: "Orders", icon: Package },
    { key: "requests", label: "Custom Requests", icon: MessageSquare },
    { key: "things", label: "Things", icon: FileText },
    { key: "customers", label: "Customers", icon: Users },
    { key: "adminmgmt", label: "Admin Management", icon: ShieldCheck },
    { key: "settings", label: "Settings", icon: SettingsIcon },
  ];
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-stone-100">
      <div className="flex items-center justify-between border-b border-stone-200 bg-white px-4 py-3">
        <div className="flex items-center gap-2">
          <ShieldCheck size={18} className="text-stone-700" />
          <span className="ls-display text-sm font-bold text-stone-800">Admin Manager</span>
          <span className="ls-body rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-medium capitalize text-stone-500">{currentUser.role}</span>
        </div>
        <Btn variant="ghost" onClick={onExit}><ArrowLeft size={14} /> Exit</Btn>
      </div>
      <div className="flex flex-1 overflow-hidden">
        <nav className="w-16 shrink-0 space-y-1 overflow-y-auto border-r border-stone-200 bg-white p-2 sm:w-44 sm:p-3">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`ls-body flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs font-medium transition-colors ${
                tab === t.key ? "bg-stone-800 text-white" : "text-stone-600 hover:bg-stone-100"
              }`}
            >
              <t.icon size={14} className="shrink-0" />
              <span className="hidden sm:inline">{t.label}</span>
            </button>
          ))}
        </nav>
        <main className="flex-1 overflow-y-auto p-4">
          {tab === "dashboard" && <AdminDashboard orders={data.orders} requests={data.requests} products={data.products} users={data.users} />}
          {tab === "products" && <AdminProducts products={data.products} onSave={actions.saveProduct} onDelete={actions.deleteProduct} />}
          {tab === "orders" && <AdminOrders orders={data.orders} onUpdate={actions.updateOrder} onStageChange={actions.updateOrderStage} onDelete={actions.deleteOrder} />}
          {tab === "requests" && <AdminRequests requests={data.requests} onUpdate={actions.updateRequest} />}
          {tab === "things" && <AdminThings things={data.things} onSave={actions.saveThing} onDelete={actions.deleteThing} />}
          {tab === "customers" && <AdminCustomers users={data.users} orders={data.orders} />}
          {tab === "adminmgmt" && <AdminManagement users={data.users} currentUser={currentUser} onSetRole={actions.setRole} />}
          {tab === "settings" && <AdminSettings settings={data.settings} onSave={actions.saveSettings} />}
        </main>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------
   ROOT APP
   ------------------------------------------------------------------------- */

export default function LivingStonesProject() {
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState({});
  const [products, setProducts] = useState({});
  const [orders, setOrders] = useState({});
  const [requests, setRequests] = useState({});
  const [things, setThings] = useState({});
  const [settings, setSettings] = useState({ siteName: "Living Stones Project" });

  const [currentUser, setCurrentUser] = useState(null);
  const [view, setView] = useState("home");
  const [cart, setCart] = useState({});
  const [authOpen, setAuthOpen] = useState(false);
  const [authError, setAuthError] = useState("");
  const [cartOpen, setCartOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const [shopSearch, setShopSearch] = useState("");
  const [adminOpen, setAdminOpen] = useState(false);

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  }, []);

  // public data (visible to everyone) + whatever the current session unlocks
  async function refreshPublicData() {
    const [p, t, s] = await Promise.all([loadProducts(), loadThings(), loadSettings()]);
    setProducts(p); setThings(t); setSettings(s);
  }
  async function refreshPrivateData() {
    const [u, o, r] = await Promise.all([loadProfiles(), loadOrders(), loadRequests()]);
    setUsers(u); setOrders(o); setRequests(r);
  }
  async function loadProfileFor(userId) {
    const { data } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
    if (data) setCurrentUser({ id: data.id, username: data.username, role: data.role });
  }

  // initial load + auth session wiring
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user && mounted) await loadProfileFor(session.user.id);
      await Promise.all([refreshPublicData(), refreshPrivateData()]);
      if (mounted) setLoading(false);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        await loadProfileFor(session.user.id);
      } else {
        setCurrentUser(null);
      }
      await refreshPrivateData();
    });

    return () => { mounted = false; sub?.subscription?.unsubscribe(); };
  }, []);

  /* ---------- auth ---------- */

  async function handleSignup(username, password) {
    setAuthError("");
    const clean = username.trim();
    if (!clean || !password) { setAuthError("Username and password required."); return; }
    const { data, error } = await supabase.auth.signUp({ email: usernameToEmail(clean), password });
    if (error) {
      setAuthError(/already|registered|exists/i.test(error.message) ? "That username is taken." : error.message);
      return;
    }
    if (data.user) {
      const { error: profileError } = await supabase.from("profiles").insert({ id: data.user.id, username: clean });
      if (profileError) {
        setAuthError(/duplicate|unique/i.test(profileError.message) ? "That username is taken." : profileError.message);
        return;
      }
    }
    setAuthOpen(false);
    showToast(`Welcome, ${clean}!`);
  }

  async function handleLogin(username, password) {
    setAuthError("");
    const clean = username.trim();
    const { error } = await supabase.auth.signInWithPassword({ email: usernameToEmail(clean), password });
    if (error) { setAuthError("Incorrect username or password."); return; }
    setAuthOpen(false);
    showToast(`Welcome back, ${clean}!`);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    setAdminOpen(false);
    showToast("Logged out.");
  }

  /* ---------- cart ---------- */

  function addToCart(product, qty) {
    setCart((c) => ({ ...c, [product.id]: Math.min(product.stock, (c[product.id] || 0) + qty) }));
    showToast(`Added ${product.name} to cart.`);
  }
  function setCartQty(id, qty) { setCart((c) => ({ ...c, [id]: qty })); }
  function removeFromCart(id) { setCart((c) => { const n = { ...c }; delete n[id]; return n; }); }

  async function placeOrder() {
    if (!currentUser) { setCartOpen(false); setAuthOpen(true); return; }
    const items = Object.entries(cart).map(([id, qty]) => (products[id] ? { product_id: id, qty } : null)).filter(Boolean);
    if (items.length === 0) return;
    const id = genId("LS");
    // runs as a single database transaction (place_order in schema.sql) so stock
    // checks + decrement + order creation can't race with another customer
    const { error } = await supabase.rpc("place_order", { p_order_id: id, p_items: items });
    if (error) { showToast(error.message || "Could not place order."); return; }
    const [o, p] = await Promise.all([loadOrders(), loadProducts()]);
    setOrders(o); setProducts(p); setCart({}); setCartOpen(false);
    setView("orders");
    showToast(`Order placed — confirmation ${id}`);
  }

  /* ---------- custom requests ---------- */

  async function submitCustomRequest(form) {
    const id = genId("REQ");
    const { error } = await supabase.from("custom_requests").insert({
      id, user_id: currentUser.id, username: currentUser.username,
      item_wanted: form.itemWanted, description: form.description, category: form.category,
      style: form.style, quantity: Number(form.quantity) || 1, budget: form.budget,
      reference_image: form.referenceImage, notes: form.notes,
    });
    if (error) { showToast(error.message || "Could not submit request."); return; }
    setRequests(await loadRequests());
    showToast("Request submitted!");
  }

  /* ---------- admin actions ---------- */

  async function saveProduct(p) {
    const payload = {
      name: p.name, image: p.image, description: p.description,
      price: Number(p.price) || 0, category: p.category, stock: Number(p.stock) || 0, available: !!p.available,
    };
    if (p.id) await supabase.from("products").update(payload).eq("id", p.id);
    else await supabase.from("products").insert(payload);
    setProducts(await loadProducts());
    showToast("Product saved.");
  }
  async function deleteProduct(id) {
    await supabase.from("products").delete().eq("id", id);
    setProducts(await loadProducts());
  }
  async function updateOrder(id, patch) {
    const payload = {};
    if ("paymentStatus" in patch) payload.payment_status = patch.paymentStatus;
    if ("adminNotes" in patch) payload.admin_notes = patch.adminNotes;
    if ("estimatedCompletion" in patch) payload.estimated_completion = patch.estimatedCompletion || null;
    await supabase.from("orders").update(payload).eq("id", id);
    setOrders(await loadOrders());
  }
  async function updateOrderStage(id, stage) {
    await supabase.from("orders").update({ stage }).eq("id", id);
    await supabase.from("order_status_history").insert({ order_id: id, stage });
    setOrders(await loadOrders());
  }
  async function deleteOrder(id) {
    const { error } = await supabase.from("orders").delete().eq("id", id);
    if (error) { showToast(error.message || "Could not delete order."); return; }
    setOrders(await loadOrders());
    showToast("Order deleted.");
  }
  async function updateRequest(id, patch) {
    const payload = {};
    if ("status" in patch) payload.status = patch.status;
    if ("adminResponse" in patch) payload.admin_response = patch.adminResponse;
    if ("estimatedPrice" in patch) payload.estimated_price = patch.estimatedPrice === "" ? null : Number(patch.estimatedPrice);
    await supabase.from("custom_requests").update(payload).eq("id", id);
    if ("status" in patch) await supabase.from("request_status_history").insert({ request_id: id, status: patch.status });
    setRequests(await loadRequests());
  }
  async function saveThing(t) {
    const payload = {
      title: t.title, cover_image: t.coverImage, content: t.content,
      photos: t.photos || [], videos: t.videos || [], date: t.date || null, author: t.author, published: !!t.published,
    };
    if (t.id) await supabase.from("things").update(payload).eq("id", t.id);
    else await supabase.from("things").insert(payload);
    setThings(await loadThings());
    showToast(t.published ? "Published." : "Saved as draft.");
  }
  async function deleteThing(id) {
    await supabase.from("things").delete().eq("id", id);
    setThings(await loadThings());
  }
  async function setRole(username, role) {
    const { error } = await supabase.from("profiles").update({ role }).eq("username", username);
    if (error) { showToast("Only the Owner can change roles."); return; }
    setUsers(await loadProfiles());
    if (currentUser?.username === username) setCurrentUser((c) => ({ ...c, role }));
  }
  async function saveSettings(s) {
    await supabase.from("settings").update({ site_name: s.siteName }).eq("id", 1);
    setSettings(s);
    showToast("Settings saved.");
  }

  /* ---------- search / admin trigger ---------- */

  async function handleSearch(q) {
    const trimmed = q.trim();
    if (trimmed === ADMIN_PHRASE) {
      if (!currentUser) {
        setAuthOpen(true);
        showToast("Log in first — admin access is tied to your account.");
        return;
      }
      if (currentUser.role === "owner" || currentUser.role === "admin") {
        setAdminOpen(true);
        return;
      }
      // only succeeds server-side if no owner exists yet (see schema.sql)
      const { data, error } = await supabase.from("profiles").update({ role: "owner" }).eq("id", currentUser.id).select();
      if (!error && data && data.length > 0) {
        setCurrentUser((c) => ({ ...c, role: "owner" }));
        setUsers(await loadProfiles());
        setAdminOpen(true);
        showToast("No owner existed yet — you've been made Owner.");
      } else {
        showToast("Phrase recognized, but this account isn't authorized as admin.");
      }
      return;
    }
    setShopSearch(trimmed);
    setView("shop");
  }

  const cartCount = Object.values(cart).reduce((s, q) => s + q, 0);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-stone-50">
        <Loader2 className="animate-spin text-stone-400" />
      </div>
    );
  }

  if (adminOpen && currentUser && (currentUser.role === "owner" || currentUser.role === "admin")) {
    return (
      <div className="min-h-screen bg-stone-100" style={{ colorScheme: "light" }}>
        <style>{FONTS_CSS}</style>
        <AdminManager
          data={{ products, orders, requests, things, users, settings }}
          actions={{ saveProduct, deleteProduct, updateOrder, updateOrderStage, deleteOrder, updateRequest, saveThing, deleteThing, setRole, saveSettings }}
          currentUser={currentUser}
          onExit={() => setAdminOpen(false)}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50">
      <style>{FONTS_CSS}</style>
      <Header
        view={view} setView={setView} currentUser={currentUser} cartCount={cartCount}
        onLogout={handleLogout} onSearch={handleSearch}
        onOpenAuth={() => setAuthOpen(true)} onOpenCart={() => setCartOpen(true)}
      />
      <main className="mx-auto max-w-5xl px-4 py-6">
        {view === "home" && <HomeView setView={setView} things={things} products={products} />}
        {view === "shop" && <ShopView products={products} cart={cart} onAdd={addToCart} initialSearch={shopSearch} />}
        {view === "custom" && <CustomRequestsView currentUser={currentUser} requests={requests} onSubmit={submitCustomRequest} onOpenAuth={() => setAuthOpen(true)} />}
        {view === "things" && <ThingsView things={things} />}
        {view === "orders" && <MyOrdersView currentUser={currentUser} orders={orders} onOpenAuth={() => setAuthOpen(true)} />}
      </main>

      <AuthModal open={authOpen} onClose={() => { setAuthOpen(false); setAuthError(""); }} onLogin={handleLogin} onSignup={handleSignup} error={authError} />
      <CartDrawer
        open={cartOpen} onClose={() => setCartOpen(false)} cart={cart} products={products}
        onQty={setCartQty} onRemove={removeFromCart} onCheckout={placeOrder} currentUser={currentUser}
      />
      <Toast toast={toast} />
    </div>
  );
}
