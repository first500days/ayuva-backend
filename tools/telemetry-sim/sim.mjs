#!/usr/bin/env node
/**
 * TEST TOOL. Pretends to be a bedside monitor by streaming MADE-UP vitals and a
 * synthetic ECG to the telemetry socket, so the central monitor can be tried
 * without hardware. Never point it at a bed holding a real patient: the
 * numbers it sends would be stored and scored as that patient's.
 *
 *   node tools/telemetry-sim/sim.mjs <ws-url> <monitor-key> [hr] [spo2] [rr]
 *   node tools/telemetry-sim/sim.mjs ws://localhost:5055/api/v1/partner/telemetry/ingest amon_xxx 118 92 24
 */
const [url, key, hrArg = '75', spo2Arg = '97', rrArg = '16'] = process.argv.slice(2);
if (!url || !key) {
  console.error('Usage: sim.mjs <ws-url> <monitor-key> [hr] [spo2] [rr]');
  process.exit(1);
}

const SAMPLE_RATE = 250;
const FRAME_MS = 200;
const hr = Number(hrArg);
const spo2 = Number(spo2Arg);
const rr = Number(rrArg);

/** One beat as a sum of bumps: P, Q, R, S, T. `phase` runs 0 to 1 through the beat. */
function ecgAt(phase) {
  const bump = (centre, width, height) =>
    height * Math.exp(-((phase - centre) ** 2) / (2 * width ** 2));
  return (
    bump(0.18, 0.025, 0.12) +
    bump(0.27, 0.01, -0.12) +
    bump(0.3, 0.012, 1.0) +
    bump(0.335, 0.012, -0.22) +
    bump(0.55, 0.05, 0.28)
  );
}

const jitter = (v, spread) => Math.round((v + (Math.random() - 0.5) * spread) * 10) / 10;

let t = 0;
const socket = new WebSocket(url);
socket.onopen = () => socket.send(JSON.stringify({ t: 'auth', key }));
socket.onclose = (e) => {
  console.error(`Closed (${e.code}) ${e.reason}`);
  process.exit(e.code === 4401 ? 2 : 0);
};
socket.onmessage = (e) => {
  if (JSON.parse(e.data).t !== 'ready') return;
  console.log(`Streaming simulated vitals: HR ${hr}, SpO2 ${spo2}, RR ${rr}. Ctrl+C to stop.`);
  setInterval(() => {
    const count = Math.round((SAMPLE_RATE * FRAME_MS) / 1000);
    const beatSeconds = 60 / hr;
    const ecg = Array.from({ length: count }, () => {
      t += 1 / SAMPLE_RATE;
      return Math.round(ecgAt((t % beatSeconds) / beatSeconds) * 1000) / 1000;
    });
    socket.send(
      JSON.stringify({
        t: 'f',
        hr: jitter(hr, 2),
        spo2: Math.min(100, jitter(spo2, 1)),
        rr: jitter(rr, 1),
        ecg,
        fs: SAMPLE_RATE,
      }),
    );
  }, FRAME_MS);
};
