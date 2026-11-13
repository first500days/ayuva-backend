import { randomBytes } from 'node:crypto';

/**
 * Supplier reorders over WhatsApp, shared by the hospital stores and the lab
 * inventory. The message names the item and quantity only: stock is not
 * patient data, but nothing about patients ever goes in it either.
 */

/** A supplier's WhatsApp number as E.164, or null if it can't be one. Ten digits are taken as Indian. */
export function whatsAppNumber(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, '');
  if (trimmed.startsWith('+'))
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
  return null;
}

/** Enough to bring usable stock back to twice the reorder level, and never less than one. */
export function suggestedReorder(usable: number, reorderLevel: number): number {
  return Math.max(1, Math.ceil(reorderLevel * 2 - usable), reorderLevel);
}

export interface ReorderText {
  orgName: string;
  item: string;
  quantity: number;
  unit: string;
  ref: string;
}

export function reorderMessage(r: ReorderText): string {
  return `Reorder request from ${r.orgName}: ${r.quantity} ${r.unit} of ${r.item}. Ref ${r.ref}. Please reply to confirm availability and the delivery date.`;
}

/** Opens WhatsApp (app or web) with the message ready to send, for when the Business API isn't set up. */
export function whatsAppLink(e164: string, text: string): string {
  return `https://wa.me/${e164.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;
}

/** A short reference the supplier can quote back: RO-YYMMDD-XXXX. */
export function reorderRef(at: Date): string {
  const d = at.toISOString().slice(2, 10).replace(/-/g, '');
  return `RO-${d}-${randomBytes(2).toString('hex').toUpperCase()}`;
}
