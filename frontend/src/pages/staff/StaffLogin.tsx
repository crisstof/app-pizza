import { useState, type FormEvent } from "react";
import { ChefHat, Lock } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { staffLogin } from "@/staffApi";

export default function StaffLogin() {
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? "/pizzaiolo";
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await staffLogin(password);
      navigate(from.startsWith("/pizzaiolo") ? from : "/pizzaiolo", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="theme-staff flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-sm gap-5 p-6">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10">
            <ChefHat className="size-6 text-primary" aria-hidden />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Espace pizzaiolo</h1>
            <p className="text-sm text-muted-foreground">Accès réservé à l'équipe</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="staff-password">Mot de passe</Label>
            <Input
              id="staff-password"
              type="password"
              autoComplete="current-password"
              autoFocus
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "staff-password-error" : undefined}
            />
            {error && (
              <p id="staff-password-error" role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </div>
          <Button type="submit" className="w-full" disabled={submitting || !password}>
            <Lock className="size-4" aria-hidden /> {submitting ? "Connexion…" : "Se connecter"}
          </Button>
        </form>

        <Link to="/" className="text-center text-sm text-muted-foreground underline-offset-4 hover:underline">
          Retour au site client
        </Link>
      </Card>
    </div>
  );
}
