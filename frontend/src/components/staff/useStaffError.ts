import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ApiError } from "@/api";

/**
 * Error handler for back-office calls: an expired staff session (401) goes
 * back to the login page (then returns here), anything else is a toast.
 */
export function useStaffError() {
  const navigate = useNavigate();
  const location = useLocation();
  return useCallback(
    (err: unknown) => {
      if (err instanceof ApiError && err.status === 401) {
        navigate("/pizzaiolo/connexion", { replace: true, state: { from: location.pathname } });
        return;
      }
      toast.error(err instanceof Error ? err.message : "Erreur inconnue.");
    },
    [navigate, location.pathname]
  );
}
