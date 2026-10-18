import { useLocation } from "wouter";

const links = [
  { href: "/cashier", label: "نقطة البيع" },
  { href: "/catalog", label: "الكتالوج" },
  { href: "/catalog-offers", label: "العروض والخصومات" },
  { href: "/my-withdrawals", label: "💳 سحوباتي" },
] as const;

export default function SellerNavigation() {
  const [location, navigate] = useLocation();
  const currentPath = location.split(/[?#]/, 1)[0]?.replace(/\/+$/, "") || "/";

  return (
    <nav aria-label="قائمة البائع" dir="rtl" className="sticky top-0 z-[110] border-b border-slate-200 bg-white/95 px-3 py-3 shadow-sm backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-3">
        <span className="shrink-0 text-sm font-black text-slate-900">أبو رغوة · البائع</span>
        <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto">
          {links.map(link => {
            const active = currentPath === link.href || (link.href === "/catalog-offers" && currentPath.startsWith("/public-offer"));
            return (
              <button
                key={link.href}
                type="button"
                aria-current={active ? "page" : undefined}
                onClick={() => navigate(link.href)}
                className={`shrink-0 rounded-xl px-3 py-2 text-sm font-bold transition ${active ? "bg-blue-700 text-white" : "bg-slate-100 text-slate-700 hover:bg-blue-50 hover:text-blue-800"}`}
              >
                {link.label}
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
