#!/usr/bin/env node
/**
 * Ayuva LIS bridge — runs on a PC on the lab network, next to the analyser.
 *
 * Analysers talk HL7 over MLLP or ASTM (E1381 framing) on a local TCP port;
 * Ayuva is reachable only over HTTPS. The bridge accepts the analyser's
 * connection, rebuilds each complete message, posts it to Ayuva with the
 * analyser's key, and answers the analyser (HL7 ACK / ASTM ACK). Messages
 * that can't be delivered wait in ./outbox and are retried every minute.
 *
 * Node 18+, no dependencies. See README.md for set-up.
 */
import net from 'node:net';
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

const URL = process.env.AYUVA_INGEST_URL;
const KEY = process.env.AYUVA_ANALYSER_KEY;
const PROTOCOL = (process.env.PROTOCOL || 'hl7').toLowerCase();
const PORT = Number(process.env.PORT || (PROTOCOL === 'hl7' ? 2575 : 5000));
const HOST = process.env.HOST || '0.0.0.0';
const OUTBOX = process.env.OUTBOX_DIR || join(process.cwd(), 'outbox');

if (!URL || !KEY || !['hl7', 'astm'].includes(PROTOCOL)) {
  console.error(
    'Set AYUVA_INGEST_URL, AYUVA_ANALYSER_KEY and PROTOCOL (hl7 | astm). See README.md.',
  );
  process.exit(1);
}
mkdirSync(OUTBOX, { recursive: true });

const log = (...a) => console.log(new Date().toISOString(), ...a);

/** Posts one message; returns Ayuva's reply, or null when it couldn't be delivered. */
async function forward(message) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-analyser-key': KEY },
        body: JSON.stringify({ message }),
      });
      if (res.status === 401) {
        log('Ayuva refused the analyser key — check AYUVA_ANALYSER_KEY');
        return null;
      }
      if (res.ok) return await res.json();
      log(`Ayuva answered ${res.status}`);
    } catch (err) {
      log(`Send failed (attempt ${attempt}): ${err.message}`);
    }
    await new Promise((r) => setTimeout(r, attempt * 2000));
  }
  return null;
}

/** Delivers, or keeps the message for later so nothing is lost. */
async function deliver(message) {
  const reply = await forward(message);
  if (reply) {
    log(
      `Delivered: ${reply.status}${reply.items?.length ? ` (${reply.items.map((i) => `${i.barcode}: ${i.applied} applied`).join(', ')})` : ''}`,
    );
    return reply;
  }
  const file = join(
    OUTBOX,
    `${Date.now()}-${Math.random().toString(36).slice(2)}.txt`,
  );
  writeFileSync(file, message);
  log(`Queued in ${file}`);
  return null;
}

setInterval(async () => {
  for (const f of readdirSync(OUTBOX)
    .filter((n) => n.endsWith('.txt'))
    .sort()) {
    const path = join(OUTBOX, f);
    if (await forward(readFileSync(path, 'utf8'))) {
      unlinkSync(path);
      log(`Re-sent ${f}`);
    } else break;
  }
}, 60_000).unref();

// ── HL7 over MLLP: <VT> message <FS><CR> ─────────────────────────────────────
const VT = 0x0b;
const FS = 0x1c;
const CR = 0x0d;

function hl7Server(socket) {
  let buf = Buffer.alloc(0);
  socket.on('data', async (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    for (;;) {
      const start = buf.indexOf(VT);
      const end = buf.indexOf(FS, start + 1);
      if (start < 0 || end < 0 || buf.length < end + 2) break;
      const message = buf.subarray(start + 1, end).toString('utf8');
      buf = buf.subarray(end + 2);
      const reply = await deliver(message);
      const controlId = /^MSH\|[^\r]*/.exec(message)?.[0].split('|')[9] ?? '';
      // Ayuva's ACK when it answered; once queued locally the bridge owns the message, so accept it.
      const ack =
        reply?.ack ??
        `MSH|^~\\&|AYUVA-BRIDGE|LAB|||${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)}||ACK^R01|ACK${controlId}|P|2.5.1\rMSA|AA|${controlId}|Queued`;
      socket.write(
        Buffer.concat([
          Buffer.from([VT]),
          Buffer.from(ack, 'utf8'),
          Buffer.from([FS, CR]),
        ]),
      );
    }
  });
}

// ── ASTM E1381: ENQ, frames <STX>FN text <ETB|ETX> C1 C2 <CR><LF>, EOT ─────────
const ENQ = 0x05;
const ACK = 0x06;
const NAK = 0x15;
const EOT = 0x04;
const STX = 0x02;
const ETX = 0x03;
const ETB = 0x17;

function checksumOk(frame) {
  // frame = FN … ETX|ETB C1 C2
  const endIdx = frame.findIndex((b) => b === ETX || b === ETB);
  if (endIdx < 0 || frame.length < endIdx + 3) return false;
  let sum = 0;
  for (let i = 0; i <= endIdx; i++) sum = (sum + frame[i]) % 256;
  const sent = String.fromCharCode(
    frame[endIdx + 1],
    frame[endIdx + 2],
  ).toUpperCase();
  return sum.toString(16).toUpperCase().padStart(2, '0') === sent;
}

function astmServer(socket) {
  let buf = Buffer.alloc(0);
  let text = '';
  socket.on('data', async (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    while (buf.length) {
      const b = buf[0];
      if (b === ENQ) {
        text = '';
        buf = buf.subarray(1);
        socket.write(Buffer.from([ACK]));
      } else if (b === EOT) {
        buf = buf.subarray(1);
        const message = text.replace(/\r\n?/g, '\r').trim();
        text = '';
        if (message) await deliver(message);
      } else if (b === STX) {
        const lf = buf.indexOf(0x0a);
        if (lf < 0) break; // wait for the rest of the frame
        const frame = [...buf.subarray(1, lf + 1)];
        buf = buf.subarray(lf + 1);
        if (!checksumOk(frame)) {
          socket.write(Buffer.from([NAK]));
          continue;
        }
        const endIdx = frame.findIndex((x) => x === ETX || x === ETB);
        // Drop the frame number; ETB frames continue the same record.
        text += Buffer.from(frame.slice(1, endIdx)).toString('utf8');
        if (frame[endIdx] === ETX && !text.endsWith('\r')) text += '\r';
        socket.write(Buffer.from([ACK]));
      } else {
        buf = buf.subarray(1); // stray byte (e.g. CR/LF between frames)
      }
    }
  });
}

const server = net.createServer((socket) => {
  log(`Analyser connected from ${socket.remoteAddress}`);
  socket.on('error', (e) => log(`Connection error: ${e.message}`));
  socket.on('close', () => log('Analyser disconnected'));
  (PROTOCOL === 'hl7' ? hl7Server : astmServer)(socket);
});
server.listen(PORT, HOST, () =>
  log(
    `Ayuva LIS bridge listening for ${PROTOCOL.toUpperCase()} on ${HOST}:${PORT} → ${URL}`,
  ),
);
