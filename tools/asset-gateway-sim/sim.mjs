#!/usr/bin/env node
/**
 * Pretends to be one or more BLE / RFID gateways so asset tracking can be seen
 * working without hardware. Each gateway posts the tags it "hears", with a
 * signal strength, to POST /asset-tracking/pings every few seconds; tags drift
 * between gateways so machines visibly change room on the Equipment tab.
 *
 *   node tools/asset-gateway-sim/sim.mjs \
 *     --url http://localhost:5001/api/v1 \
 *     --gateway agk_firstKey --gateway agk_secondKey \
 *     --tags AC:23:3F:A1:02:9B,AC:23:3F:A1:02:9C [--every 5]
 *
 * Real gateways (Minew, Kontakt, Zebra RFID readers…) can usually post JSON
 * to an HTTP endpoint; a small adapter maps their payload to
 * { "pings": [{ "tag": "<MAC or EPC>", "rssi": -61, "at": "<ISO time>" }] }
 * with the header x-gateway-key.
 */

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const all = (name) => args.flatMap((a, i) => (a === `--${name}` ? [args[i + 1]] : []));

const url = (opt('url') ?? 'http://localhost:5001/api/v1').replace(/\/$/, '');
const gateways = all('gateway').filter(Boolean);
const tags = (opt('tags') ?? '').split(',').map((t) => t.trim()).filter(Boolean);
const every = Number(opt('every') ?? 5) * 1000;

if (!gateways.length || !tags.length) {
  console.error('Need at least one --gateway <key> and --tags <tag,tag>');
  process.exit(1);
}

// Each tag starts near a random gateway and occasionally walks to another.
const near = new Map(tags.map((t) => [t, Math.floor(Math.random() * gateways.length)]));

async function tick() {
  for (const t of tags) if (Math.random() < 0.15) near.set(t, Math.floor(Math.random() * gateways.length));
  await Promise.all(
    gateways.map(async (key, g) => {
      const pings = tags.map((tag) => ({
        tag,
        // Strong where the tag "is", weak (or unheard) elsewhere.
        rssi: near.get(tag) === g ? -50 - Math.round(Math.random() * 10) : -80 - Math.round(Math.random() * 10),
        at: new Date().toISOString(),
      }));
      try {
        const res = await fetch(`${url}/asset-tracking/pings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-gateway-key': key },
          body: JSON.stringify({ pings }),
        });
        const body = await res.json().catch(() => ({}));
        console.log(`gateway ${g + 1}: HTTP ${res.status}`, JSON.stringify(body));
      } catch (err) {
        console.error(`gateway ${g + 1}: ${err.message}`);
      }
    }),
  );
}

await tick();
setInterval(tick, every);
