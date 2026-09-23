import type { Order } from "@/api";
import { formatDayLong, formatPrice, formatTime } from "./format";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/**
 * Opens a kitchen ticket (80 mm thermal-printer width, also fine on A4) in a
 * small window and brings up the print dialog. Only on demand: the staff
 * clicks "Imprimer" when they want paper.
 */
export function printTicket(order: Order) {
  const win = window.open("", "_blank", "width=380,height=640");
  if (!win) return false; // Popup blocked.

  const e = escapeHtml;
  const items = order.items
    .map((i) => `<tr><td class="qty">${i.quantity}×</td><td>${e(i.pizza.name)}</td></tr>`)
    .join("");

  win.document.write(`<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>Ticket ${e(order.id.slice(0, 8))}</title>
<style>
  @page { size: 80mm auto; margin: 4mm; }
  body { font: 13px/1.35 ui-monospace, Menlo, Consolas, monospace; color: #000; margin: 0; width: 72mm; }
  h1 { font-size: 16px; text-align: center; margin: 0 0 2mm; }
  .center { text-align: center; }
  .big { font-size: 22px; font-weight: 700; text-align: center; margin: 2mm 0; }
  hr { border: 0; border-top: 1px dashed #000; margin: 3mm 0; }
  table { width: 100%; border-collapse: collapse; font-size: 16px; }
  td { padding: 1mm 0; vertical-align: top; }
  .qty { width: 12mm; font-weight: 700; }
  .row { display: flex; justify-content: space-between; }
</style></head>
<body>
  <h1>App Pizza</h1>
  <p class="center">Réf ${e(order.id.slice(0, 8))}</p>
  <p class="big">Retrait ${e(formatTime(order.timeSlot.startsAt))}</p>
  <p class="center">${e(formatDayLong(order.timeSlot.startsAt))}</p>
  <hr>
  <p><strong>${e(order.client.name)}</strong>${order.client.phone ? `<br>${e(order.client.phone)}` : ""}</p>
  <hr>
  <table>${items}</table>
  <hr>
  ${order.discountCents > 0 ? `<p class="row"><span>Pizza offerte</span><span>−${e(formatPrice(order.discountCents))}</span></p>` : ""}
  <p class="row"><strong>Total</strong><strong>${e(formatPrice(order.totalCents))}</strong></p>
  <hr>
  <p class="center">Imprimé le ${e(new Date().toLocaleString("fr-FR"))}</p>
  <script>window.onload = () => { window.print(); window.onafterprint = () => window.close(); };</script>
</body></html>`);
  win.document.close();
  return true;
}
