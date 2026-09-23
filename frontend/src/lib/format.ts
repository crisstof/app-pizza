export function formatPrice(cents: number) {
  return (cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
}

export function formatTime(value: string | Date) {
  return new Date(value).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}
