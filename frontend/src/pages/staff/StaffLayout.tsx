import { useEffect, useState } from "react";
import {
  BarChart3,
  CalendarClock,
  ChefHat,
  ExternalLink,
  Flame,
  LogOut,
  Pizza as PizzaIcon,
  ReceiptText,
  Users,
  Wheat,
  type LucideIcon,
} from "lucide-react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { fetchStaffSession, staffLogout } from "@/staffApi";

const NAV: { to: string; label: string; icon: LucideIcon; end?: boolean }[] = [
  { to: "/pizzaiolo", label: "Service", icon: Flame, end: true },
  { to: "/pizzaiolo/commandes", label: "Commandes", icon: ReceiptText },
  { to: "/pizzaiolo/pates", label: "Pâtons", icon: Wheat },
  { to: "/pizzaiolo/carte", label: "Carte", icon: PizzaIcon },
  { to: "/pizzaiolo/creneaux", label: "Créneaux", icon: CalendarClock },
  { to: "/pizzaiolo/clients", label: "Clients", icon: Users },
  { to: "/pizzaiolo/stats", label: "Statistiques", icon: BarChart3 },
];

function navClass({ isActive }: { isActive: boolean }) {
  return `flex min-h-10 shrink-0 items-center gap-2.5 rounded-lg px-3 text-sm font-medium transition-colors ${
    isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
  }`;
}

export default function StaffLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [checked, setChecked] = useState(false);

  // Gate the whole back-office on a valid staff session.
  useEffect(() => {
    let cancelled = false;
    fetchStaffSession()
      .then(({ staff }) => {
        if (cancelled) return;
        if (staff) setChecked(true);
        else navigate("/pizzaiolo/connexion", { replace: true, state: { from: location.pathname } });
      })
      .catch(() => {
        // Server unreachable: let the page show its own offline state.
        if (!cancelled) setChecked(true);
      });
    return () => {
      cancelled = true;
    };
    // Checked once on entry; pages handle a session expiring later.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleLogout() {
    await staffLogout().catch(() => {});
    navigate("/pizzaiolo/connexion", { replace: true });
  }

  if (!checked) {
    return <div className="theme-staff flex min-h-screen items-center justify-center text-muted-foreground">Chargement…</div>;
  }

  return (
    <div className="theme-staff min-h-screen lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]">
      <aside className="border-b bg-card lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col lg:border-r lg:border-b-0">
        <div className="flex items-center justify-between gap-3 px-4 py-3 lg:py-5">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10">
              <ChefHat className="size-5 text-primary" aria-hidden />
            </div>
            <div className="leading-tight">
              <p className="font-bold">App Pizza</p>
              <p className="text-xs text-muted-foreground">Espace pizzaiolo</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={handleLogout} aria-label="Déconnexion">
            <LogOut className="size-4" />
          </Button>
        </div>

        <nav
          aria-label="Espace pizzaiolo"
          className="flex gap-1 overflow-x-auto px-3 pb-3 [scrollbar-width:none] lg:flex-1 lg:flex-col lg:overflow-visible [&::-webkit-scrollbar]:hidden"
        >
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={navClass}>
              <Icon className="size-4" aria-hidden /> {label}
            </NavLink>
          ))}
        </nav>

        <div className="hidden space-y-1 border-t p-3 lg:block">
          <a href="/" target="_blank" rel="noreferrer" className={navClass({ isActive: false })}>
            <ExternalLink className="size-4" aria-hidden /> Voir le site client
          </a>
          <button type="button" onClick={handleLogout} className={`w-full ${navClass({ isActive: false })}`}>
            <LogOut className="size-4" aria-hidden /> Déconnexion
          </button>
        </div>
      </aside>

      <main className="mx-auto w-full max-w-6xl min-w-0 px-4 py-6 lg:px-8 lg:py-8">
        <Outlet />
      </main>
    </div>
  );
}
