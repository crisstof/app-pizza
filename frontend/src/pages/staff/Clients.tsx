import { useCallback, useEffect, useState } from "react";
import { Gift, Mail, Minus, Phone, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { LOYALTY_REWARD_THRESHOLD } from "@/api";
import { STATUS_CONFIG } from "@/components/staff/orderStatus";
import { PageHeader } from "@/components/staff/PageHeader";
import { useStaffError } from "@/components/staff/useStaffError";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { formatDateShort, formatPrice, formatTime } from "@/lib/format";
import { adjustLoyalty, fetchClient, fetchClients, type AdminClient, type AdminClientDetail } from "@/staffApi";

const SEARCH_DELAY_MS = 300;

function ClientDialog({ clientId, onClose, onChanged }: { clientId: string; onClose: () => void; onChanged: () => void }) {
  const [client, setClient] = useState<AdminClientDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const fail = useStaffError();

  useEffect(() => {
    fetchClient(clientId).then(setClient).catch(fail);
  }, [clientId, fail]);

  async function adjust(delta: number) {
    if (!client) return;
    setBusy(true);
    try {
      const updated = await adjustLoyalty(client.id, delta);
      setClient({ ...client, loyaltyPoints: updated.loyaltyPoints });
      toast.success(`${delta > 0 ? "+" : ""}${delta} tampon${Math.abs(delta) > 1 ? "s" : ""} pour ${client.name}`);
      onChanged();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  const stamps = client?.loyaltyPoints ?? 0;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="theme-staff max-h-[90vh] overflow-y-auto sm:max-w-lg">
        {!client ? (
          <DialogHeader>
            <DialogTitle>Chargement…</DialogTitle>
          </DialogHeader>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex flex-wrap items-center gap-2">
                {client.name}
                <Badge variant={client.hasAccount ? "default" : "outline"}>{client.hasAccount ? "Compte" : "Invité"}</Badge>
              </DialogTitle>
              <DialogDescription>Client depuis le {formatDateShort(client.createdAt)}</DialogDescription>
            </DialogHeader>

            <div className="flex flex-wrap gap-2 text-sm">
              <a href={`mailto:${client.email}`} className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 hover:bg-muted">
                <Mail className="size-4" aria-hidden /> {client.email}
              </a>
              {client.phone && (
                <a href={`tel:${client.phone}`} className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 hover:bg-muted">
                  <Phone className="size-4" aria-hidden /> {client.phone}
                </a>
              )}
            </div>

            <section className="rounded-lg border p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="flex items-center gap-2 font-semibold">
                  <Gift className="size-4 text-accent" aria-hidden /> Carte fidélité
                </h3>
                <span className="text-sm font-semibold tabular-nums" aria-live="polite">
                  {stamps} tampon{stamps > 1 ? "s" : ""}
                </span>
              </div>
              <div className="mb-3 grid grid-cols-10 gap-1" aria-hidden>
                {Array.from({ length: LOYALTY_REWARD_THRESHOLD }, (_, i) => (
                  <span
                    key={i}
                    className={`aspect-square rounded-full border-2 ${i < Math.min(stamps, LOYALTY_REWARD_THRESHOLD) ? "border-primary bg-primary" : "border-border"}`}
                  />
                ))}
              </div>
              {stamps >= LOYALTY_REWARD_THRESHOLD && (
                <p className="mb-3 text-sm font-semibold text-primary">Pizza offerte à sa prochaine commande.</p>
              )}
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Ajuster :</span>
                <Button size="sm" variant="outline" disabled={busy || stamps < 1} onClick={() => adjust(-1)}>
                  <Minus className="size-3.5" aria-hidden /> 1
                </Button>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => adjust(1)}>
                  <Plus className="size-3.5" aria-hidden /> 1
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy || stamps >= LOYALTY_REWARD_THRESHOLD}
                  onClick={() => adjust(LOYALTY_REWARD_THRESHOLD - stamps)}
                >
                  Offrir une pizza
                </Button>
              </div>
            </section>

            <section>
              <h3 className="mb-2 font-semibold">
                Commandes <span className="text-sm font-normal text-muted-foreground">({client.orders.length})</span>
              </h3>
              {client.orders.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucune commande.</p>
              ) : (
                <ul className="divide-y rounded-lg border text-sm">
                  {client.orders.map((order) => (
                    <li key={order.id} className="flex items-start justify-between gap-3 px-3 py-2">
                      <div className="min-w-0">
                        <p className="font-medium">
                          {formatDateShort(order.timeSlot.startsAt)} à {formatTime(order.timeSlot.startsAt)}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {order.items.map((i) => `${i.quantity}× ${i.pizza.name}`).join(", ")}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <span className="font-semibold tabular-nums">{formatPrice(order.totalCents)}</span>
                        <Badge variant={STATUS_CONFIG[order.status].variant}>{STATUS_CONFIG[order.status].label}</Badge>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function Clients() {
  const [query, setQuery] = useState("");
  const [clients, setClients] = useState<AdminClient[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const fail = useStaffError();

  const load = useCallback(
    (signal: { cancelled: boolean }) =>
      fetchClients(query.trim())
        .then((c) => !signal.cancelled && setClients(c))
        .catch((err) => !signal.cancelled && fail(err)),
    [query, fail]
  );

  useEffect(() => {
    const signal = { cancelled: false };
    const timer = setTimeout(() => load(signal), query ? SEARCH_DELAY_MS : 0);
    return () => {
      signal.cancelled = true;
      clearTimeout(timer);
    };
  }, [load, query]);

  return (
    <>
      <PageHeader
        title="Clients"
        description={clients ? `${clients.length}${clients.length === 100 ? "+" : ""} client${clients.length > 1 ? "s" : ""}` : undefined}
        actions={
          <div className="relative w-full sm:w-80">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              type="search"
              placeholder="Nom, email ou téléphone…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9"
              aria-label="Rechercher un client"
            />
          </div>
        }
      />

      {clients === null ? (
        <p className="text-sm text-muted-foreground">Chargement…</p>
      ) : clients.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">Aucun client trouvé.</p>
      ) : (
        <Card className="overflow-hidden p-0">
          <ul className="divide-y">
            {clients.map((client) => (
              <li key={client.id}>
                <button
                  type="button"
                  onClick={() => setOpenId(client.id)}
                  className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-4 py-3 text-left transition-colors hover:bg-muted/60 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1.6fr)_6rem_6rem_5.5rem]"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate font-semibold">{client.name}</span>
                    <Badge variant={client.hasAccount ? "default" : "outline"} className="shrink-0">
                      {client.hasAccount ? "Compte" : "Invité"}
                    </Badge>
                  </span>
                  <span className="text-right text-sm font-semibold tabular-nums md:order-last">
                    <Gift className="mr-1 inline size-3.5 text-accent" aria-hidden />
                    {client.loyaltyPoints}
                    <span className="sr-only"> tampons</span>
                  </span>
                  <span className="col-span-2 truncate text-sm text-muted-foreground md:col-span-1">
                    {client.email}
                    {client.phone && ` · ${client.phone}`}
                  </span>
                  <span className="text-sm text-muted-foreground tabular-nums">
                    {client.orderCount} cmd
                  </span>
                  <span className="text-right text-sm tabular-nums md:text-left">{formatPrice(client.spentCents)}</span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {openId && (
        <ClientDialog
          clientId={openId}
          onClose={() => setOpenId(null)}
          onChanged={() => load({ cancelled: false })}
        />
      )}
    </>
  );
}
