"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { Check, ChevronsLeft, CornerDownLeft, LogOut, Menu, Monitor, Moon, Palette, Search, Sun, X } from "lucide-react";
import { ACCENTS, readTheme, saveTheme } from "@/lib/theme";
import { signOut } from "next-auth/react";
import { useRouter } from "next/navigation";

const COLLAPSE_KEY = "sidebar-collapsed";

function readCookie(name) {
  if (typeof document === "undefined") return "";
  const row = document.cookie.split("; ").find((r) => r.startsWith(name + "="));
  return row ? decodeURIComponent(row.split("=")[1]) : "";
}

/**
 * Shared shell navigation for every role panel.
 *
 * sections: [{ title?, roles?, items: [{ label, href, icon, exact?, roles?, children?: [{ label, href }] }] }]
 * Optional controlled mobile state via sidebarOpen / setSidebarOpen (pages that already pass them keep working).
 */
export default function AppSidebar({
  panel,
  homeHref,
  sections,
  roleLabel,
  sidebarOpen,
  setSidebarOpen,
  floatingButton = true,
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  const role = session?.user?.role;

  const [selfOpen, setSelfOpen] = useState(false);
  const controlled = typeof setSidebarOpen === "function";
  const open = controlled ? !!sidebarOpen : selfOpen;
  const setOpen = controlled ? setSidebarOpen : setSelfOpen;

  const [collapsed, setCollapsed] = useState(false);
  const [cookieName, setCookieName] = useState("");

  useEffect(() => {
    try { setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1"); } catch {}
    setCookieName(readCookie("userName"));
  }, []);

  // Close the mobile drawer on navigation and on Escape.
  useEffect(() => { setOpen(false); }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  const [searchOpen, setSearchOpen] = useState(false);
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      try { localStorage.setItem(COLLAPSE_KEY, c ? "0" : "1"); } catch {}
      return !c;
    });
  };

  const isActive = (href, exact) =>
    exact ? pathname === href : pathname === href || pathname?.startsWith(href + "/");
  const allowed = (roles) => !roles || roles.includes(role);

  const userName = session?.user?.name || cookieName || session?.user?.email || "User";
  // Show who is actually signed in. A panel's own label applies only when the signed-in
  // role is that panel's role (a super-admin browsing Reception is not "Reception staff").
  const ROLE_NAMES = {
    "super-admin": "Super admin", admin: "Admin", owner: "Owner", reception: "Reception",
    sales: "Sales", surgery: "Surgery", collab: "Collab", hr: "HR", stock: "Stock", counsellor: "Counsellor",
  };
  const ownPanel = roleLabel && role && roleLabel.toLowerCase().startsWith((ROLE_NAMES[role] || role).toLowerCase());
  const subline = (ownPanel ? roleLabel : ROLE_NAMES[role]) || session?.user?.email || "";
  const initials = userName.trim().slice(0, 2).toUpperCase();

  const logout = async () => {
    try {
      await signOut({ redirect: false, callbackUrl: "/login" });
      router.push("/login");
      router.refresh();
    } catch (err) {
      console.error("Logout error:", err);
    }
  };

  // Collapse only applies on desktop; the mobile drawer is always full width.
  const rail = collapsed;

  const searchItems = sections
    .filter((s) => allowed(s.roles))
    .flatMap((s) =>
      s.items.filter((i) => allowed(i.roles)).flatMap((i) => [
        { label: i.label, href: i.href, icon: i.icon, group: s.title || "" },
        ...(i.children || []).map((c) => ({ label: c.label, href: c.href, icon: i.icon, group: i.label })),
      ])
    )
    .filter((v, n, arr) => arr.findIndex((x) => x.href === v.href) === n);

  return (
    <>
      {floatingButton && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open navigation"
          className="lg:hidden fixed top-3 left-3 z-40 w-10 h-10 flex items-center justify-center bg-white border border-gray-200 rounded-lg shadow-sm text-gray-700 hover:bg-gray-50 active:scale-[0.97] transition"
        >
          <Menu className="w-5 h-5" />
        </button>
      )}

      <div
        aria-hidden
        onClick={() => setOpen(false)}
        className={`fixed inset-0 z-40 bg-gray-950/30 lg:hidden transition-opacity duration-200 ${
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      />

      <aside
        aria-label={`${panel} navigation`}
        data-floating={floatingButton ? "" : undefined}
        className={`app-sidebar fixed left-0 top-0 z-50 h-screen shrink-0 lg:sticky flex flex-col bg-white border-r border-gray-200
          w-64 ${rail ? "lg:w-16" : "lg:w-60"}
          transition-[transform,width] duration-300 ease-(--ease-drawer) lg:duration-200 lg:ease-(--ease-out)
          ${open ? "translate-x-0 shadow-xl lg:shadow-none" : "-translate-x-full lg:translate-x-0"}`}
      >
        {/* Brand */}
        <div className={`h-14 shrink-0 flex items-center gap-2.5 border-b border-gray-100 ${rail ? "lg:justify-center lg:px-0" : ""} px-4`}>
          <Link href={homeHref} className="flex items-center gap-2.5 min-w-0 rounded-md">
            <span className="w-7 h-7 shrink-0 rounded-md bg-gray-900 text-white flex items-center justify-center text-[13px] font-semibold tracking-tight">
              R
            </span>
            <span className={`min-w-0 ${rail ? "lg:hidden" : ""}`}>
              <span className="block text-sm font-semibold text-gray-900 leading-tight">RyanCRM</span>
              <span className="block text-xs text-gray-500 leading-tight truncate">{panel}</span>
            </span>
          </Link>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close navigation"
            className="ml-auto lg:hidden p-1.5 rounded-md text-gray-500 hover:bg-gray-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Jump to page */}
        <div className={`shrink-0 px-2 pt-3 ${rail ? "lg:px-3" : ""}`}>
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            aria-label="Search pages"
            title={rail ? "Search pages (Ctrl K)" : undefined}
            className={`press w-full flex items-center gap-2 h-8 px-2.5 rounded-md border border-gray-200 bg-gray-50/80 text-[13px] text-gray-500 hover:border-gray-300 hover:text-gray-700 ${rail ? "lg:justify-center lg:px-0" : ""}`}
          >
            <Search className="w-3.5 h-3.5 shrink-0" aria-hidden />
            <span className={`flex-1 text-left ${rail ? "lg:hidden" : ""}`}>Search pages</span>
            <kbd className={`text-[11px] font-sans text-gray-400 ${rail ? "lg:hidden" : ""}`}>Ctrl K</kbd>
          </button>
        </div>

        {/* Nav */}
        <nav className="app-sidebar-nav flex-1 overflow-y-auto overflow-x-hidden px-2 pt-4 pb-6">
          {sections.filter((s) => allowed(s.roles)).map((section, si) => {
            const items = section.items.filter((i) => allowed(i.roles));
            if (!items.length) return null;
            return (
              <div key={section.title || si} className={si > 0 ? "mt-5" : ""}>
                {section.title && (
                  <p className={`px-2.5 mb-1.5 text-[11px] font-medium uppercase tracking-[0.06em] text-gray-400 ${rail ? "lg:sr-only" : ""}`}>
                    {section.title}
                  </p>
                )}
                {section.title && rail && <div className="hidden lg:block mx-2.5 mb-2 h-px bg-gray-100" />}
                <ul className="space-y-px">
                  {items.map((item) => {
                    const active = isActive(item.href, item.exact);
                    const Icon = item.icon;
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          title={rail ? item.label : undefined}
                          aria-current={active ? "page" : undefined}
                          className={`group relative flex items-center gap-2.5 h-8 px-2.5 rounded-md text-[13.5px] transition-colors duration-150
                            ${rail ? "lg:justify-center lg:px-0" : ""}
                            ${active
                              ? "bg-indigo-50/70 text-indigo-950 font-medium"
                              : "text-gray-600 hover:bg-gray-100/70 hover:text-gray-900"}`}
                        >
                          {Icon && (
                            <Icon
                              aria-hidden
                              strokeWidth={active ? 2.1 : 1.8}
                              className={`w-4 h-4 shrink-0 transition-colors duration-150 ${active ? "text-indigo-600" : "text-gray-400 group-hover:text-gray-600"}`}
                            />
                          )}
                          <span className={`truncate ${rail ? "lg:hidden" : ""}`}>{item.label}</span>
                        </Link>
                        {item.children && active && (
                          <ul className={`mt-px mb-1 ml-[1.15rem] pl-3 border-l border-gray-200 space-y-px ${rail ? "lg:hidden" : ""}`}>
                            {item.children.map((c) => {
                              const ca = isActive(c.href);
                              return (
                                <li key={c.href}>
                                  <Link
                                    href={c.href}
                                    aria-current={ca ? "page" : undefined}
                                    className={`flex items-center h-7 px-2 rounded-md text-[13px] transition-colors duration-150 ${
                                      ca ? "text-indigo-950 font-medium bg-indigo-50/70" : "text-gray-500 hover:text-gray-900 hover:bg-gray-100/70"
                                    }`}
                                  >
                                    {c.label}
                                  </Link>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </nav>

        {/* User + collapse */}
        <div className="shrink-0 border-t border-gray-100 p-2">
          <div className={`relative flex items-center gap-2.5 px-2 py-2 ${rail ? "lg:flex-col lg:px-0" : ""}`}>
            <span
              title={rail ? userName : undefined}
              className="w-7 h-7 shrink-0 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center text-[11px] font-semibold"
            >
              {initials}
            </span>
            <span className={`min-w-0 flex-1 ${rail ? "lg:hidden" : ""}`}>
              <span className="block text-sm font-medium text-gray-900 truncate leading-tight">{userName}</span>
              {subline && <span className="block text-xs text-gray-500 truncate leading-tight">{subline}</span>}
            </span>
            <ThemePicker />
            <button
              type="button"
              onClick={logout}
              title="Log out"
              aria-label="Log out"
              className="p-1.5 rounded-md text-gray-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={rail ? "Expand sidebar" : "Collapse sidebar"}
            aria-pressed={rail}
            className="hidden lg:flex w-full items-center gap-2.5 h-8 px-2.5 rounded-md text-xs text-gray-500 hover:bg-gray-50 hover:text-gray-900 transition-colors"
          >
            <ChevronsLeft
              aria-hidden
              className={`w-4 h-4 shrink-0 transition-transform duration-200 ${rail ? "rotate-180 mx-auto" : ""}`}
            />
            <span className={rail ? "hidden" : ""}>Collapse</span>
          </button>
        </div>
      </aside>

      {searchOpen && (
        <PageSearch
          items={searchItems}
          onClose={() => setSearchOpen(false)}
          onGo={(href) => { setSearchOpen(false); router.push(href); }}
        />
      )}
    </>
  );
}

/*
 * Jump-to-page palette (Ctrl/⌘ K). Lists only the pages this role's sidebar already
 * shows. Opened many times a day from the keyboard, so it appears instantly: no animation.
 */
function PageSearch({ items, onClose, onGo }) {
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((i) => `${i.label} ${i.group}`.toLowerCase().includes(needle));
  }, [q, items]);

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => { setIdx(0); }, [q]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${idx}"]`)?.scrollIntoView({ block: "nearest" });
  }, [idx]);

  const onKey = (e) => {
    if (e.key === "Escape") { e.preventDefault(); onClose(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); setIdx((i) => Math.min(i + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter" && results[idx]) { e.preventDefault(); onGo(results[idx].href); }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[12vh]" role="presentation">
      <div className="absolute inset-0 bg-gray-950/30" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search pages"
        className="relative w-full max-w-lg bg-white rounded-xl border border-gray-200 shadow-2xl overflow-hidden"
      >
        <div className="flex items-center gap-2.5 px-4 h-12 border-b border-gray-100">
          <Search className="w-4 h-4 text-gray-400 shrink-0" aria-hidden />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder="Search pages…"
            aria-label="Search pages"
            role="combobox"
            aria-expanded="true"
            aria-controls="page-search-list"
            aria-activedescendant={results[idx] ? `ps-${idx}` : undefined}
            className="flex-1 h-full text-sm text-gray-900 bg-transparent outline-none focus-visible:outline-none placeholder:text-gray-400"
          />
          <kbd className="hidden sm:inline-flex h-5 items-center px-1.5 rounded border border-gray-200 text-[11px] text-gray-500 font-sans">Esc</kbd>
        </div>
        <ul id="page-search-list" ref={listRef} role="listbox" className="max-h-80 overflow-y-auto p-1.5">
          {results.length === 0 && <li className="px-3 py-8 text-center text-sm text-gray-500">No page matches “{q}”.</li>}
          {results.map((r, i) => {
            const Icon = r.icon;
            const on = i === idx;
            return (
              <li
                key={r.href}
                id={`ps-${i}`}
                data-idx={i}
                role="option"
                aria-selected={on}
                onMouseMove={() => setIdx(i)}
                onClick={() => onGo(r.href)}
                className={`flex items-center gap-3 h-9 px-2.5 rounded-md text-sm cursor-pointer ${on ? "bg-gray-100 text-gray-900" : "text-gray-700"}`}
              >
                {Icon ? <Icon className="w-4 h-4 text-gray-400 shrink-0" aria-hidden /> : <span className="w-4 shrink-0" />}
                <span className="truncate">{r.label}</span>
                {r.group && <span className="ml-auto text-xs text-gray-400 truncate">{r.group}</span>}
                {on && <CornerDownLeft className="w-3.5 h-3.5 text-gray-400 shrink-0" aria-hidden />}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

/* Appearance popover: light / dark / system + accent. Saved per browser (lib/theme). */
function ThemePicker() {
  const [open, setOpen] = useState(false);
  const [t, setT] = useState({ mode: "light", accent: "emerald" });
  const ref = useRef(null);

  useEffect(() => { setT(readTheme()); }, []);
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); window.removeEventListener("keydown", onKey); };
  }, [open]);

  const set = (patch) => { const next = { ...t, ...patch }; setT(next); saveTheme(next); };
  const MODES = [
    { id: "light", label: "Light", icon: Sun },
    { id: "dark", label: "Dark", icon: Moon },
    { id: "system", label: "System", icon: Monitor },
  ];

  return (
    <div ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Appearance"
        aria-expanded={open}
        title="Appearance"
        className={`p-1.5 rounded-md transition-colors ${open ? "bg-gray-100 text-gray-900" : "text-gray-400 hover:text-gray-700 hover:bg-gray-100"}`}
      >
        <Palette className="w-4 h-4" />
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Appearance"
          className="pop-in absolute bottom-full left-0 mb-2 w-56 rounded-xl border border-gray-200 bg-white p-3 shadow-xl z-[60]"
          style={{ transformOrigin: "bottom left" }}
        >
          <p className="text-xs font-medium text-gray-500 mb-2">Mode</p>
          <div role="radiogroup" aria-label="Mode" className="grid grid-cols-3 gap-1 p-0.5 rounded-lg border border-gray-200 bg-gray-50">
            {MODES.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={t.mode === id}
                onClick={() => set({ mode: id })}
                className={`flex flex-col items-center gap-1 py-1.5 rounded-md text-[11px] transition-colors duration-150 ${
                  t.mode === id ? "bg-white text-gray-900 font-medium shadow-xs ring-1 ring-gray-200" : "text-gray-500 hover:text-gray-900"
                }`}
              >
                <Icon className="w-4 h-4" aria-hidden />
                {label}
              </button>
            ))}
          </div>
          <p className="text-xs font-medium text-gray-500 mt-3 mb-2">Accent</p>
          <div role="radiogroup" aria-label="Accent" className="flex gap-2">
            {ACCENTS.map((a) => (
              <button
                key={a.id}
                type="button"
                role="radio"
                aria-checked={t.accent === a.id}
                aria-label={a.label}
                title={a.label}
                onClick={() => set({ accent: a.id })}
                className="press grid h-8 w-8 place-items-center rounded-full ring-offset-2 ring-offset-white transition-shadow"
                style={{ background: a.swatch, boxShadow: t.accent === a.id ? `0 0 0 2px var(--color-white), 0 0 0 4px ${a.swatch}` : undefined }}
              >
                {t.accent === a.id && <Check className="w-4 h-4 text-white" style={{ color: "#fff" }} aria-hidden />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
