import {
  reorderMessage,
  reorderRef,
  suggestedReorder,
  whatsAppLink,
  whatsAppNumber,
} from './supplier-reorder';

describe('supplier reorder helpers', () => {
  it('normalises supplier WhatsApp numbers to E.164', () => {
    expect(whatsAppNumber('98123 45678')).toBe('+919812345678');
    expect(whatsAppNumber('+91 98123-45678')).toBe('+919812345678');
    expect(whatsAppNumber('919812345678')).toBe('+919812345678');
    expect(whatsAppNumber('+44 20 7946 0958')).toBe('+442079460958');
    expect(whatsAppNumber('12345')).toBeNull();
    expect(whatsAppNumber('')).toBeNull();
    expect(whatsAppNumber(undefined)).toBeNull();
  });

  it('suggests enough to reach twice the reorder level', () => {
    expect(suggestedReorder(5, 20)).toBe(35);
    expect(suggestedReorder(0, 0)).toBe(1);
    expect(suggestedReorder(50, 20)).toBe(20);
  });

  it('builds a message with no patient data and a ready-to-send link', () => {
    const text = reorderMessage({
      orgName: 'City Hospital',
      item: 'Paracetamol 500 mg Tablet',
      quantity: 200,
      unit: 'strips',
      ref: 'RO-261113-AB12',
    });
    expect(text).toContain('200 strips of Paracetamol 500 mg Tablet');
    expect(text).toContain('RO-261113-AB12');
    const link = whatsAppLink('+919812345678', text);
    expect(link.startsWith('https://wa.me/919812345678?text=')).toBe(true);
    expect(decodeURIComponent(link.split('text=')[1])).toBe(text);
  });

  it('makes dated references', () => {
    expect(reorderRef(new Date('2026-11-13T10:00:00Z'))).toMatch(
      /^RO-261113-[0-9A-F]{4}$/,
    );
  });
});
