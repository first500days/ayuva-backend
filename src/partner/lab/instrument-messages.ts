/**
 * Analyser result messages: HL7 v2 (ORU^R01) and ASTM E1394 / CLSI LIS2-A2.
 * The on-site bridge (tools/lis-bridge) strips transport framing (MLLP, or
 * ASTM's ENQ/STX/ETX/checksum frames) and posts the message text here.
 */

export interface InstrumentResult {
  /** The analyser's test code, e.g. "GLU". */
  code: string;
  name: string | null;
  value: string;
  unit: string | null;
  refRange: string | null;
  flag: string | null;
}

export interface InstrumentSpecimen {
  /** Sample ID as the analyser read it from the tube: our vial barcode. */
  barcode: string;
  results: InstrumentResult[];
}

export interface ParsedMessage {
  protocol: 'hl7' | 'astm';
  /** HL7 MSH-10, echoed in the acknowledgement. */
  controlId: string | null;
  messageType: string | null;
  specimens: InstrumentSpecimen[];
}

/** MLLP start (VT) and end (FS) bytes, if the bridge left them on. */
const MLLP = [String.fromCharCode(0x0b), String.fromCharCode(0x1c)];

const records = (raw: string) =>
  MLLP.reduce((s, ch) => s.split(ch).join(''), raw)
    .split(/\r\n|\r|\n/)
    .map((l) => l.trim())
    .filter(Boolean);

export function parseHl7(raw: string): ParsedMessage {
  const lines = records(raw);
  const msh = lines.find((l) => l.startsWith('MSH'));
  if (!msh) throw new Error('Not an HL7 message (no MSH segment)');
  const fs = msh[3];
  const cs = msh[4] ?? '^';
  const msf = msh.split(fs);
  // MSH-1 is the separator itself, so MSH-n sits at index n-1.
  const mshField = (n: number) => msf[n - 1] ?? '';
  const comp = (v: string | undefined, i = 0) => (v ?? '').split(cs)[i] ?? '';

  const specimens: InstrumentSpecimen[] = [];
  let current: InstrumentSpecimen | null = null;
  for (const line of lines) {
    const f = line.split(fs);
    const seg = f[0];
    if (seg === 'OBR' || seg === 'SPM') {
      const id = seg === 'SPM' ? comp(f[2]) : comp(f[3]) || comp(f[2]);
      if (!id) continue;
      if (seg === 'SPM' && current && !current.results.length) {
        current.barcode = id;
        continue;
      }
      current = { barcode: id, results: [] };
      specimens.push(current);
    } else if (seg === 'OBX' && current) {
      const value = (f[5] ?? '').trim();
      if (!value) continue;
      current.results.push({
        code: comp(f[3]),
        name: comp(f[3], 1) || null,
        value,
        unit: comp(f[6]) || null,
        refRange: f[7] || null,
        flag: f[8] || null,
      });
    }
  }
  return {
    protocol: 'hl7',
    controlId: mshField(10) || null,
    messageType: mshField(9) || null,
    specimens: specimens.filter((s) => s.results.length),
  };
}

export function parseAstm(raw: string): ParsedMessage {
  // Strip an ASTM frame number left in front of a record ("1H|…").
  const lines = records(raw).map((l) => l.replace(/^\d(?=[HPOCRLQM]\|)/, ''));
  const header = lines.find((l) => l.startsWith('H'));
  if (!header) throw new Error('Not an ASTM message (no H record)');
  const fs = header[1];
  const rs = header[2] ?? '\\';
  const cs = header[3] ?? '^';
  const comp = (v: string | undefined, i: number) =>
    (v ?? '').split(rs)[0].split(cs)[i] ?? '';

  const specimens: InstrumentSpecimen[] = [];
  let current: InstrumentSpecimen | null = null;
  for (const line of lines) {
    const f = line.split(fs);
    if (f[0] === 'O') {
      const id = comp(f[2], 0) || comp(f[3], 0);
      if (!id) continue;
      current = { barcode: id, results: [] };
      specimens.push(current);
    } else if (f[0] === 'R' && current) {
      const value = (f[3] ?? '').trim();
      if (!value) continue;
      // Universal test ID: ^^^code^name (manufacturer's code in component 4).
      const code = comp(f[2], 3) || comp(f[2], 0);
      current.results.push({
        code,
        name: comp(f[2], 4) || null,
        value,
        unit: f[4] || null,
        refRange: f[5] || null,
        flag: f[6] || null,
      });
    }
  }
  return {
    protocol: 'astm',
    controlId: null,
    messageType: 'ASTM',
    specimens: specimens.filter((s) => s.results.length),
  };
}

export function parseInstrumentMessage(
  protocol: 'hl7' | 'astm',
  raw: string,
): ParsedMessage {
  return protocol === 'hl7' ? parseHl7(raw) : parseAstm(raw);
}

/** HL7 acknowledgement (AA accepted, AE error) for the bridge to hand back to the analyser. */
export function hl7Ack(
  controlId: string | null,
  code: 'AA' | 'AE',
  text: string,
  at = new Date(),
): string {
  const ts = at.toISOString().replace(/[-:T]/g, '').slice(0, 14);
  return [
    `MSH|^~\\&|AYUVA|LAB|||${ts}||ACK^R01|ACK${controlId ?? ts}|P|2.5.1`,
    `MSA|${code}|${controlId ?? ''}|${text.replace(/[|^~\\&\r\n]/g, ' ').slice(0, 80)}`,
  ].join('\r');
}
