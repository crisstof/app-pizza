import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { ImagePlus, Pencil, Pizza as PizzaIcon, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { resolveImageUrl, type PizzaCategory, type PizzaTag } from "@/api";
import { PageHeader } from "@/components/staff/PageHeader";
import { useStaffError } from "@/components/staff/useStaffError";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { formatPrice } from "@/lib/format";
import {
  createPizza,
  deletePizza,
  fetchAdminPizzas,
  updatePizza,
  uploadPizzaPhoto,
  type AdminPizza,
  type PizzaInput,
} from "@/staffApi";

const CATEGORIES: { value: PizzaCategory; label: string }[] = [
  { value: "TOMATO", label: "Base tomate" },
  { value: "CREAM", label: "Base crème" },
  { value: "SPECIAL", label: "Spécialité" },
];
const TAGS: { value: PizzaTag; label: string }[] = [
  { value: "popular", label: "Populaire" },
  { value: "new", label: "Nouveau" },
  { value: "spicy", label: "Épicée" },
  { value: "vegetarian", label: "Végétarienne" },
];
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

/** "12,50" / "12.5" / "12" → 1250, or null if not a positive price. */
function parsePrice(value: string): number | null {
  const normalized = value.replace(",", ".").replace(/[€\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const cents = Math.round(Number(normalized) * 100);
  return cents > 0 ? cents : null;
}

type Draft = { name: string; description: string; price: string; category: PizzaCategory; tags: PizzaTag[]; available: boolean };

function toDraft(pizza?: AdminPizza): Draft {
  return {
    name: pizza?.name ?? "",
    description: pizza?.description ?? "",
    price: pizza ? (pizza.priceCents / 100).toFixed(2).replace(".", ",") : "",
    category: pizza?.category ?? "TOMATO",
    tags: pizza?.tags ?? [],
    available: pizza?.available ?? true,
  };
}

function PizzaFormDialog({
  pizza,
  onClose,
  onSaved,
}: {
  /** undefined = new pizza */
  pizza?: AdminPizza;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(pizza));
  const [photo, setPhoto] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fail = useStaffError();

  const preview = useMemo(() => (photo ? URL.createObjectURL(photo) : resolveImageUrl(pizza?.imageUrl ?? null)), [photo, pizza]);
  useEffect(() => () => {
    if (photo && preview) URL.revokeObjectURL(preview);
  }, [photo, preview]);

  function pickPhoto(file: File | undefined) {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Photo en JPEG, PNG ou WebP uniquement.");
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setError("Photo trop lourde (5 Mo maximum).");
      return;
    }
    setError(null);
    setPhoto(file);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const priceCents = parsePrice(draft.price);
    if (!draft.name.trim()) return setError("Le nom est requis.");
    if (priceCents === null) return setError("Prix invalide (ex. 12,50).");

    const input: PizzaInput = {
      name: draft.name.trim(),
      description: draft.description.trim() || null,
      priceCents,
      category: draft.category,
      tags: draft.tags,
      available: draft.available,
    };
    setSaving(true);
    setError(null);
    try {
      const saved = pizza ? await updatePizza(pizza.id, input) : await createPizza(input);
      if (photo) {
        try {
          await uploadPizzaPhoto(saved.id, photo);
        } catch (err) {
          // The pizza itself is saved: close (re-submitting a new pizza would
          // hit "name taken") and report only the photo failure.
          onSaved();
          onClose();
          fail(err);
          return;
        }
      }
      toast.success(pizza ? `${input.name} mise à jour` : `${input.name} ajoutée à la carte`);
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue.");
    } finally {
      setSaving(false);
    }
  }

  const toggleTag = (tag: PizzaTag) =>
    setDraft((d) => ({ ...d, tags: d.tags.includes(tag) ? d.tags.filter((t) => t !== tag) : [...d.tags, tag] }));

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="theme-staff max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{pizza ? `Modifier ${pizza.name}` : "Nouvelle pizza"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="relative size-24 shrink-0 overflow-hidden rounded-lg border bg-muted">
              {preview ? (
                <img src={preview} alt="" className="absolute inset-0 size-full object-cover" />
              ) : (
                <PizzaIcon className="m-auto mt-8 size-8 text-muted-foreground" aria-hidden />
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="pizza-photo" className="cursor-pointer">
                <span className="inline-flex min-h-9 items-center gap-2 rounded-md border bg-card px-3 text-sm font-medium hover:bg-muted">
                  <ImagePlus className="size-4" aria-hidden /> {preview ? "Changer la photo" : "Ajouter une photo"}
                </span>
              </Label>
              <input
                id="pizza-photo"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={(e) => pickPhoto(e.target.files?.[0])}
              />
              <p className="text-xs text-muted-foreground">JPEG, PNG ou WebP, 5 Mo max.</p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_8rem]">
            <div className="space-y-2">
              <Label htmlFor="pizza-name">Nom</Label>
              <Input id="pizza-name" value={draft.name} maxLength={60} required onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pizza-price">Prix (€)</Label>
              <Input
                id="pizza-price"
                inputMode="decimal"
                placeholder="12,50"
                value={draft.price}
                required
                onChange={(e) => setDraft({ ...draft, price: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="pizza-description">Ingrédients</Label>
            <Textarea
              id="pizza-description"
              rows={2}
              maxLength={200}
              placeholder="Tomate, mozzarella, basilic…"
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="pizza-category">Catégorie</Label>
            <Select value={draft.category} onValueChange={(v) => setDraft({ ...draft, category: v as PizzaCategory })}>
              <SelectTrigger id="pizza-category" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="theme-staff">
                {CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Badges</legend>
            <div className="flex flex-wrap gap-2">
              {TAGS.map((tag) => {
                const on = draft.tags.includes(tag.value);
                return (
                  <button
                    key={tag.value}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleTag(tag.value)}
                    className={`min-h-9 rounded-full border px-3.5 text-sm transition-colors ${
                      on ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:border-primary/60"
                    }`}
                  >
                    {tag.label}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <Label htmlFor="pizza-available" className="flex flex-col items-start gap-0.5">
              <span>Disponible</span>
              <span className="text-xs font-normal text-muted-foreground">Décoché : affichée « Épuisée » côté client.</span>
            </Label>
            <Switch id="pizza-available" checked={draft.available} onCheckedChange={(v) => setDraft({ ...draft, available: v })} />
          </div>

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Enregistrement…" : pizza ? "Enregistrer" : "Ajouter à la carte"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeletePizzaButton({ pizza, onConfirm }: { pizza: AdminPizza; onConfirm: () => void }) {
  const ordered = pizza._count.orderItems > 0;
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" aria-label={`Supprimer ${pizza.name}`}>
          <Trash2 className="size-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="theme-staff">
        <AlertDialogHeader>
          <AlertDialogTitle>Retirer {pizza.name} de la carte ?</AlertDialogTitle>
          <AlertDialogDescription>
            {ordered
              ? "Elle a déjà été commandée : elle disparaît de la carte mais reste visible dans l'historique des commandes."
              : "Elle n'a jamais été commandée : elle sera supprimée définitivement."}{" "}
            Pour la retirer juste pour aujourd'hui, utilise plutôt l'interrupteur « Disponible ».
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Garder</AlertDialogCancel>
          <AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90" onClick={onConfirm}>
            Retirer de la carte
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default function MenuAdmin() {
  const [pizzas, setPizzas] = useState<AdminPizza[]>([]);
  const [loading, setLoading] = useState(true);
  // null = closed, "new" = creating, otherwise the pizza being edited
  const [editing, setEditing] = useState<AdminPizza | "new" | null>(null);
  const fail = useStaffError();

  const load = useCallback(async () => {
    try {
      setPizzas(await fetchAdminPizzas());
    } catch (err) {
      fail(err);
    } finally {
      setLoading(false);
    }
  }, [fail]);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleAvailable(pizza: AdminPizza, available: boolean) {
    setPizzas((prev) => prev.map((p) => (p.id === pizza.id ? { ...p, available } : p)));
    try {
      await updatePizza(pizza.id, { available });
      toast.success(available ? `${pizza.name} de retour à la carte` : `${pizza.name} marquée épuisée`);
    } catch (err) {
      setPizzas((prev) => prev.map((p) => (p.id === pizza.id ? { ...p, available: !available } : p)));
      fail(err);
    }
  }

  async function handleDelete(pizza: AdminPizza) {
    try {
      const result = await deletePizza(pizza.id);
      toast.success(result.deleted ? `${pizza.name} supprimée` : `${pizza.name} retirée de la carte`);
      setPizzas((prev) => prev.filter((p) => p.id !== pizza.id));
    } catch (err) {
      fail(err);
    }
  }

  const soldOut = pizzas.filter((p) => !p.available).length;

  return (
    <>
      <PageHeader
        title="La carte"
        description={`${pizzas.length} pizzas${soldOut ? ` · ${soldOut} épuisée${soldOut > 1 ? "s" : ""}` : ""}`}
        actions={
          <Button onClick={() => setEditing("new")}>
            <Plus className="size-4" aria-hidden /> Ajouter une pizza
          </Button>
        }
      />

      {loading ? (
        <p className="text-sm text-muted-foreground">Chargement…</p>
      ) : (
        CATEGORIES.map((category) => {
          const list = pizzas.filter((p) => p.category === category.value);
          if (list.length === 0) return null;
          return (
            <section key={category.value} className="mb-8">
              <h2 className="mb-3 text-sm font-semibold tracking-wide text-muted-foreground uppercase">
                {category.label} · {list.length}
              </h2>
              <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
                {list.map((pizza) => {
                  const image = resolveImageUrl(pizza.imageUrl);
                  return (
                    <li key={pizza.id}>
                      <Card className={`flex-row items-center gap-3 p-3 ${pizza.available ? "" : "bg-muted/50"}`}>
                        <div className={`relative size-16 shrink-0 overflow-hidden rounded-lg bg-muted ${pizza.available ? "" : "grayscale"}`}>
                          {image ? (
                            <img src={image} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />
                          ) : (
                            <PizzaIcon className="m-auto mt-4 size-7 text-muted-foreground" aria-hidden />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="flex flex-wrap items-center gap-1.5 font-semibold">
                            {pizza.name}
                            {!pizza.available && <Badge variant="destructive">Épuisée</Badge>}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">{pizza.description}</p>
                          <p className="text-sm font-semibold tabular-nums">{formatPrice(pizza.priceCents)}</p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <Switch
                            checked={pizza.available}
                            onCheckedChange={(v) => toggleAvailable(pizza, v)}
                            aria-label={`${pizza.name} disponible`}
                          />
                          <div className="flex">
                            <Button variant="ghost" size="icon" onClick={() => setEditing(pizza)} aria-label={`Modifier ${pizza.name}`}>
                              <Pencil className="size-4" />
                            </Button>
                            <DeletePizzaButton pizza={pizza} onConfirm={() => handleDelete(pizza)} />
                          </div>
                        </div>
                      </Card>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })
      )}

      {editing && (
        <PizzaFormDialog
          key={editing === "new" ? "new" : editing.id}
          pizza={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
          onSaved={load}
        />
      )}
    </>
  );
}
