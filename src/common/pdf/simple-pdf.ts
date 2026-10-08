/**
 * Minimal, dependency-free PDF writer for server-generated clinical documents
 * (e-prescriptions, visit summaries, lab reports, discharge summaries) that
 * land in the patient's Medical Vault. Uses the PDF standard-14 Helvetica
 * family with WinAnsi encoding, so no fonts are embedded and the output opens
 * in any viewer. Flow layout: wrapped text, key/value grids and tables with
 * automatic page breaks, plus a footer with page numbers.
 */

export type Rgb = [number, number, number];
type FontKey = 'regular' | 'bold' | 'italic';

const PAGE_W = 595.28; // A4
const PAGE_H = 841.89;

// Helvetica / Helvetica-Bold advance widths for WinAnsi codes 32..126 (AFM, 1/1000 em).
// Helvetica-Oblique shares Helvetica's metrics.
const HELVETICA = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278,
  278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584,
  584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556,
  833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278,
  278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222,
  500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500,
  500, 334, 260, 334, 584,
];
const HELVETICA_BOLD = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278,
  278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584,
  584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611,
  833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333,
  278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278,
  556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556,
  500, 389, 280, 389, 584,
];

// Unicode → WinAnsi byte for the characters clinical text commonly uses.
const WIN_ANSI: Record<string, [number, number]> = {
  '–': [0x96, 556], // en dash
  '—': [0x97, 1000], // em dash
  '•': [0x95, 350], // bullet
  '‘': [0x91, 222],
  '’': [0x92, 222],
  '“': [0x93, 333],
  '”': [0x94, 333],
  '…': [0x85, 1000],
  '°': [0xb0, 400],
  '·': [0xb7, 278],
  '×': [0xd7, 584],
  µ: [0xb5, 556],
  '±': [0xb1, 584],
  '©': [0xa9, 737],
  '≤': [0x3c, 584], // ≤ → <
  '≥': [0x3e, 584], // ≥ → >
};

/** Characters with no WinAnsi glyph, rewritten before encoding. */
const REWRITE: Record<string, string> = { '₹': 'Rs.', '→': '->', '←': '<-' };

export interface TextOptions {
  size?: number;
  font?: FontKey;
  color?: Rgb;
  indent?: number;
  gapAfter?: number;
  lineHeight?: number;
}

export interface TableColumn {
  header: string;
  /** Fraction of the content width; columns should sum to 1. */
  width: number;
  align?: 'left' | 'right';
}

const COLORS = {
  ink: [0.1, 0.16, 0.16] as Rgb,
  muted: [0.42, 0.47, 0.5] as Rgb,
  brand: [0.055, 0.486, 0.482] as Rgb,
  rule: [0.85, 0.88, 0.89] as Rgb,
  zebra: [0.96, 0.975, 0.975] as Rgb,
};

export class PdfBuilder {
  readonly colors = COLORS;
  private readonly margin: number;
  private readonly pages: string[][] = [];
  private y = 0;
  private footerText = '';

  constructor(private readonly opts: { title?: string; margin?: number } = {}) {
    this.margin = opts.margin ?? 48;
    this.newPage();
  }

  get contentWidth() {
    return PAGE_W - this.margin * 2;
  }

  /** Small grey line printed at the bottom of every page, next to the page number. */
  footer(text: string) {
    this.footerText = text;
    return this;
  }

  /** Full-bleed letterhead band across the top of the first page. Call it first. */
  banner(title: string, subtitle?: string, right?: string) {
    const h = subtitle ? 80 : 62;
    const rightW = right ? this.measure(right, 10, 'bold') + 20 : 0;
    this.rect(0, PAGE_H - h, PAGE_W, h, COLORS.brand);
    this.raw(
      this.textOp(
        this.fit(title, this.contentWidth - rightW, 17, 'bold'),
        this.margin,
        PAGE_H - 36,
        17,
        'bold',
        [1, 1, 1],
      ),
    );
    if (subtitle) {
      this.raw(
        this.textOp(
          this.fit(subtitle, this.contentWidth - rightW, 10, 'regular'),
          this.margin,
          PAGE_H - 56,
          10,
          'regular',
          [0.88, 0.96, 0.96],
        ),
      );
    }
    if (right) {
      this.raw(
        this.textOp(
          right,
          PAGE_W - this.margin - (rightW - 20),
          PAGE_H - 36,
          10,
          'bold',
          [1, 1, 1],
        ),
      );
    }
    this.y = h + 20;
    return this;
  }

  heading(text: string, size = 12) {
    this.space(6);
    this.text(text.toUpperCase(), {
      size,
      font: 'bold',
      color: COLORS.brand,
      gapAfter: 2,
    });
    this.hr();
    return this;
  }

  text(text: string, o: TextOptions = {}) {
    const size = o.size ?? 10;
    const font = o.font ?? 'regular';
    const lh = o.lineHeight ?? size * 1.38;
    const indent = o.indent ?? 0;
    for (const paragraph of String(text ?? '').split(/\r?\n/)) {
      const lines = this.wrap(
        paragraph,
        this.contentWidth - indent,
        size,
        font,
      );
      for (const line of lines) {
        this.ensure(lh);
        this.raw(
          this.textOp(
            line,
            this.margin + indent,
            PAGE_H - this.y - size,
            size,
            font,
            o.color ?? COLORS.ink,
          ),
        );
        this.y += lh;
      }
    }
    this.y += o.gapAfter ?? 4;
    return this;
  }

  /** Label/value grid, e.g. Patient / Date / Doctor, laid out in `columns` columns. */
  keyValues(pairs: [string, string][], columns = 2) {
    const colW = this.contentWidth / columns;
    for (let i = 0; i < pairs.length; i += columns) {
      const row = pairs.slice(i, i + columns);
      const heights = row.map(
        ([, v]) => this.wrap(v || '—', colW - 8, 10, 'bold').length,
      );
      const h = 12 + Math.max(...heights) * 13 + 6;
      this.ensure(h);
      row.forEach(([k, v], c) => {
        const x = this.margin + c * colW;
        this.raw(
          this.textOp(
            k.toUpperCase(),
            x,
            PAGE_H - this.y - 8,
            7.5,
            'bold',
            COLORS.muted,
          ),
        );
        this.wrap(v || '—', colW - 8, 10, 'bold').forEach((line, li) => {
          this.raw(
            this.textOp(
              line,
              x,
              PAGE_H - this.y - 22 - li * 13,
              10,
              'bold',
              COLORS.ink,
            ),
          );
        });
      });
      this.y += h;
    }
    return this;
  }

  table(
    columns: TableColumn[],
    rows: string[][],
    opts: { size?: number; rowColors?: (Rgb | null)[] } = {},
  ) {
    const size = opts.size ?? 9.5;
    const lh = size * 1.32;
    const widths = columns.map((c) => c.width * this.contentWidth);
    const drawHeader = () => {
      const h = lh + 8;
      this.ensure(h + lh + 8);
      this.rect(
        this.margin,
        PAGE_H - this.y - h,
        this.contentWidth,
        h,
        [0.9, 0.95, 0.95],
      );
      let x = this.margin;
      columns.forEach((c, i) => {
        const label = c.header.toUpperCase();
        const tx =
          c.align === 'right'
            ? x + widths[i] - 6 - this.measure(label, 7.5, 'bold')
            : x + 6;
        this.raw(
          this.textOp(
            label,
            tx,
            PAGE_H - this.y - h + 7,
            7.5,
            'bold',
            COLORS.brand,
          ),
        );
        x += widths[i];
      });
      this.y += h;
    };
    drawHeader();
    rows.forEach((row, ri) => {
      const cells = row.map((cell, i) =>
        this.wrap(
          cell ?? '',
          widths[i] - 12,
          size,
          i === 0 ? 'bold' : 'regular',
        ),
      );
      const h = Math.max(...cells.map((c) => c.length)) * lh + 8;
      if (this.y + h > PAGE_H - this.margin - 24) {
        this.newPage();
        drawHeader();
      }
      const fill = opts.rowColors?.[ri] ?? (ri % 2 === 1 ? COLORS.zebra : null);
      if (fill)
        this.rect(this.margin, PAGE_H - this.y - h, this.contentWidth, h, fill);
      let x = this.margin;
      cells.forEach((lines, i) => {
        lines.forEach((line, li) => {
          const font: FontKey = i === 0 ? 'bold' : 'regular';
          const tx =
            columns[i].align === 'right'
              ? x + widths[i] - 6 - this.measure(line, size, font)
              : x + 6;
          this.raw(
            this.textOp(
              line,
              tx,
              PAGE_H - this.y - 4 - size - li * lh,
              size,
              font,
              COLORS.ink,
            ),
          );
        });
        x += widths[i];
      });
      this.y += h;
      this.line(
        this.margin,
        PAGE_H - this.y,
        this.margin + this.contentWidth,
        PAGE_H - this.y,
        COLORS.rule,
        0.5,
      );
    });
    this.y += 6;
    return this;
  }

  hr(color: Rgb = COLORS.rule) {
    this.ensure(8);
    this.line(
      this.margin,
      PAGE_H - this.y - 2,
      this.margin + this.contentWidth,
      PAGE_H - this.y - 2,
      color,
      0.75,
    );
    this.y += 8;
    return this;
  }

  space(pts: number) {
    this.y += pts;
    return this;
  }

  /** A signature block: a rule with the signer's details beneath it, right-aligned. */
  signature(lines: string[]) {
    const w = 220;
    const x = this.margin + this.contentWidth - w;
    this.ensure(30 + lines.length * 13);
    this.space(18);
    this.line(x, PAGE_H - this.y, x + w, PAGE_H - this.y, COLORS.ink, 0.75);
    this.y += 4;
    lines.forEach((l, i) => {
      this.raw(
        this.textOp(
          l,
          x,
          PAGE_H - this.y - 10,
          i === 0 ? 10 : 8.5,
          i === 0 ? 'bold' : 'regular',
          i === 0 ? COLORS.ink : COLORS.muted,
        ),
      );
      this.y += i === 0 ? 14 : 12;
    });
    return this;
  }

  build(): Buffer {
    const total = this.pages.length;
    this.pages.forEach((ops, i) => {
      const label = `Page ${i + 1} of ${total}`;
      const y = 26;
      this.lineOn(
        ops,
        this.margin,
        y + 12,
        PAGE_W - this.margin,
        y + 12,
        COLORS.rule,
        0.5,
      );
      if (this.footerText)
        ops.push(
          this.textOp(
            this.fit(this.footerText, this.contentWidth - 70, 7.5, 'regular'),
            this.margin,
            y,
            7.5,
            'regular',
            COLORS.muted,
          ),
        );
      ops.push(
        this.textOp(
          label,
          PAGE_W - this.margin - this.measure(label, 7.5, 'regular'),
          y,
          7.5,
          'regular',
          COLORS.muted,
        ),
      );
    });

    const objects: string[] = [];
    const pageIds: number[] = [];
    // 1 catalog, 2 pages, 3-5 fonts, 6 info; pages start at 7 (page, content pairs).
    this.pages.forEach((_, i) => pageIds.push(7 + i * 2));
    objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
    objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${total} >>`;
    objects[3] =
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
    objects[4] =
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
    objects[5] =
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>';
    const now = new Date();
    const stamp = `D:${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;
    objects[6] = `<< /Producer (${this.encode('Ayuva')}) /Title (${this.encode(this.opts.title ?? 'Ayuva document')}) /CreationDate (${stamp}) >>`;

    const streams: Buffer[] = [];
    this.pages.forEach((ops, i) => {
      const pageId = 7 + i * 2;
      const contentId = pageId + 1;
      objects[pageId] =
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ` +
        `/Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> >> /Contents ${contentId} 0 R >>`;
      streams[contentId] = Buffer.from(ops.join('\n'), 'latin1');
    });

    const chunks: Buffer[] = [];
    let offset = 0;
    const push = (b: Buffer) => {
      chunks.push(b);
      offset += b.length;
    };
    push(Buffer.from('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n', 'latin1'));
    const count = 7 + this.pages.length * 2;
    const offsets: number[] = [];
    for (let id = 1; id < count; id++) {
      offsets[id] = offset;
      if (streams[id]) {
        push(
          Buffer.from(
            `${id} 0 obj\n<< /Length ${streams[id].length} >>\nstream\n`,
            'latin1',
          ),
        );
        push(streams[id]);
        push(Buffer.from('\nendstream\nendobj\n', 'latin1'));
      } else {
        push(Buffer.from(`${id} 0 obj\n${objects[id]}\nendobj\n`, 'latin1'));
      }
    }
    const xrefAt = offset;
    let xref = `xref\n0 ${count}\n0000000000 65535 f\r\n`;
    for (let id = 1; id < count; id++)
      xref += `${String(offsets[id]).padStart(10, '0')} 00000 n\r\n`;
    xref += `trailer\n<< /Size ${count} /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;
    push(Buffer.from(xref, 'latin1'));
    return Buffer.concat(chunks);
  }

  // ── internals ─────────────────────────────────────────────────────────────

  private newPage() {
    this.pages.push([]);
    this.y = this.margin;
  }

  private ensure(h: number) {
    if (this.y + h > PAGE_H - this.margin - 24) this.newPage();
  }

  private raw(op: string) {
    this.pages[this.pages.length - 1].push(op);
  }

  private rect(x: number, y: number, w: number, h: number, color: Rgb) {
    this.raw(`${rgb(color)} rg ${n(x)} ${n(y)} ${n(w)} ${n(h)} re f`);
  }

  private line(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    color: Rgb,
    width: number,
  ) {
    this.lineOn(
      this.pages[this.pages.length - 1],
      x1,
      y1,
      x2,
      y2,
      color,
      width,
    );
  }

  private lineOn(
    ops: string[],
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    color: Rgb,
    width: number,
  ) {
    ops.push(
      `${rgb(color)} RG ${n(width)} w ${n(x1)} ${n(y1)} m ${n(x2)} ${n(y2)} l S`,
    );
  }

  private textOp(
    text: string,
    x: number,
    y: number,
    size: number,
    font: FontKey,
    color: Rgb,
  ) {
    const f = font === 'bold' ? 'F2' : font === 'italic' ? 'F3' : 'F1';
    return `BT /${f} ${n(size)} Tf ${rgb(color)} rg ${n(x)} ${n(y)} Td (${this.encode(text)}) Tj ET`;
  }

  /** Text width in points. */
  measure(text: string, size: number, font: FontKey): number {
    const table = font === 'bold' ? HELVETICA_BOLD : HELVETICA;
    let w = 0;
    for (const ch of normalise(text)) {
      const code = ch.charCodeAt(0);
      if (code >= 32 && code <= 126) w += table[code - 32];
      else w += WIN_ANSI[ch]?.[1] ?? 556;
    }
    return (w * size) / 1000;
  }

  /** Greedy word wrap; words longer than a line are broken by character. */
  wrap(text: string, width: number, size: number, font: FontKey): string[] {
    const words = normalise(text).split(/\s+/).filter(Boolean);
    if (words.length === 0) return [''];
    const lines: string[] = [];
    let current = '';
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (this.measure(candidate, size, font) <= width) {
        current = candidate;
        continue;
      }
      if (current) lines.push(current);
      if (this.measure(word, size, font) <= width) {
        current = word;
      } else {
        let chunk = '';
        for (const ch of word) {
          if (this.measure(chunk + ch, size, font) > width && chunk) {
            lines.push(chunk);
            chunk = ch;
          } else chunk += ch;
        }
        current = chunk;
      }
    }
    if (current) lines.push(current);
    return lines;
  }

  private fit(
    text: string,
    width: number,
    size: number,
    font: FontKey,
  ): string {
    if (this.measure(text, size, font) <= width) return text;
    let t = text;
    while (t.length > 1 && this.measure(`${t}...`, size, font) > width)
      t = t.slice(0, -1);
    return `${t}...`;
  }

  /** PDF literal-string body in WinAnsi bytes, with delimiters escaped. */
  private encode(text: string): string {
    let out = '';
    for (const ch of normalise(text)) {
      let code = ch.charCodeAt(0);
      if (WIN_ANSI[ch]) code = WIN_ANSI[ch][0];
      else if (code > 255 || (code < 32 && code !== 9)) code = 0x3f; // '?'
      if (code === 0x28 || code === 0x29 || code === 0x5c)
        out += `\\${String.fromCharCode(code)}`;
      else if (code < 32 || code > 126)
        out += `\\${code.toString(8).padStart(3, '0')}`;
      else out += String.fromCharCode(code);
    }
    return out;
  }
}

function normalise(text: string): string {
  let t = String(text ?? '')
    .normalize('NFC')
    .replace(/\t/g, '  ');
  for (const [from, to] of Object.entries(REWRITE)) t = t.split(from).join(to);
  return t;
}

function n(v: number): string {
  return Number(v.toFixed(2)).toString();
}

function rgb(c: Rgb): string {
  return c.map((v) => n(v)).join(' ');
}

function pad(v: number): string {
  return String(v).padStart(2, '0');
}
