/** Pure shaping of the Admin Panel's live system graph: statuses and edges from raw measurements. */

export type NodeStatus =
  'operational' | 'degraded' | 'down' | 'idle' | 'not_configured';

export interface PulseNode {
  key: string;
  name: string;
  status: NodeStatus;
  /** One-line headline for the node, e.g. "12 ms" or "3 sockets". */
  headline: string;
  latencyMs: number | null;
  metrics: Record<string, number | string | null>;
}

export interface PulseEdge {
  from: string;
  to: string;
  status: NodeStatus;
}

export interface Measurements {
  api: {
    perMinute: number;
    p95Ms: number;
    errorRate: number;
    loopLagMs: number;
    heapMb: number;
    uptimeS: number;
  };
  /** `up: null` = not measured yet (the first frame after someone opens the graph). */
  mongo: { up: boolean | null; pingMs: number | null };
  redis: { up: boolean | null; pingMs: number | null };
  sockets: { partner: number; admin: number };
  ai: { last5m: number; avgMs: number | null; flagged: number };
  channels: { push: boolean; whatsapp: boolean; sms: boolean };
}

const CHANNEL_NOTE = 'log-only until credentials are set';

export function apiStatus(api: Measurements['api']): NodeStatus {
  if (api.errorRate >= 0.25) return 'down';
  if (api.errorRate >= 0.05 || api.loopLagMs >= 200 || api.p95Ms >= 2000)
    return 'degraded';
  return 'operational';
}

export function pingStatus(
  up: boolean | null,
  ms: number | null,
  slowMs: number,
): NodeStatus {
  if (up === null) return 'idle';
  if (!up || ms === null) return 'down';
  return ms >= slowMs ? 'degraded' : 'operational';
}

function pingHeadline(p: { up: boolean | null; pingMs: number | null }) {
  if (p.up === null) return 'Checking…';
  return p.pingMs === null ? 'No reply' : `${p.pingMs} ms`;
}

export function buildPulse(m: Measurements): {
  nodes: PulseNode[];
  edges: PulseEdge[];
} {
  const channel = (key: string, name: string, on: boolean): PulseNode => ({
    key,
    name,
    status: on ? 'operational' : 'not_configured',
    headline: on ? 'Configured' : 'Log-only',
    latencyMs: null,
    metrics: { mode: on ? 'live' : CHANNEL_NOTE },
  });
  const nodes: PulseNode[] = [
    {
      key: 'clients',
      name: 'Apps & portals',
      status: m.api.perMinute ? 'operational' : 'idle',
      headline: `${m.api.perMinute} req/min`,
      latencyMs: null,
      metrics: {
        requestsPerMinute: m.api.perMinute,
        partnerSockets: m.sockets.partner,
        adminSockets: m.sockets.admin,
      },
    },
    {
      key: 'api',
      name: 'API',
      status: apiStatus(m.api),
      headline: `p95 ${m.api.p95Ms} ms`,
      latencyMs: m.api.p95Ms,
      metrics: {
        requestsPerMinute: m.api.perMinute,
        p95Ms: m.api.p95Ms,
        errorRatePct: Math.round(m.api.errorRate * 1000) / 10,
        eventLoopLagMs: m.api.loopLagMs,
        heapMb: m.api.heapMb,
        uptimeMin: Math.round(m.api.uptimeS / 60),
      },
    },
    {
      key: 'mongo',
      name: 'MongoDB',
      status: pingStatus(m.mongo.up, m.mongo.pingMs, 250),
      headline: pingHeadline(m.mongo),
      latencyMs: m.mongo.pingMs,
      metrics: { pingMs: m.mongo.pingMs },
    },
    {
      key: 'redis',
      name: 'Redis',
      status: pingStatus(m.redis.up, m.redis.pingMs, 100),
      headline: pingHeadline(m.redis),
      latencyMs: m.redis.pingMs,
      metrics: { pingMs: m.redis.pingMs },
    },
    {
      key: 'partner_live',
      name: 'Partner live socket',
      status: m.sockets.partner ? 'operational' : 'idle',
      headline: `${m.sockets.partner} connected`,
      latencyMs: null,
      metrics: { signedInSockets: m.sockets.partner },
    },
    {
      key: 'ai',
      name: 'AI engine (rule-based)',
      status: m.ai.last5m ? 'operational' : 'idle',
      headline: `${m.ai.last5m} calls / 5 min`,
      latencyMs: m.ai.avgMs,
      metrics: {
        callsLast5Min: m.ai.last5m,
        avgLatencyMs: m.ai.avgMs,
        flaggedLast5Min: m.ai.flagged,
      },
    },
    channel('push', 'Push (FCM)', m.channels.push),
    channel('whatsapp', 'WhatsApp', m.channels.whatsapp),
    channel('sms', 'SMS', m.channels.sms),
  ];
  const status = new Map(nodes.map((n) => [n.key, n.status]));
  const edges: PulseEdge[] = [
    { from: 'clients', to: 'api', status: status.get('api')! },
    ...['mongo', 'redis', 'partner_live', 'ai', 'push', 'whatsapp', 'sms'].map(
      (to) => ({ from: 'api', to, status: status.get(to)! }),
    ),
  ];
  return { nodes, edges };
}

/** Which log lines belong to a node when an admin investigates it. */
export const NODE_LOG_CONTEXTS: Record<string, RegExp> = {
  api: /./,
  clients: /Exception|Auth|Throttl|Router|Http/i,
  mongo: /Mongo|Mongoose|Database/i,
  redis: /Redis|Bull|Queue|Reminder/i,
  partner_live: /Live|Gateway|WarRoom|Ws/i,
  ai: /Ai|Scribe|Coding|Interpreter|Symptom|Assistant|Journey|Prep/i,
  push: /Push|Fcm|Expo|Notif/i,
  whatsapp: /WhatsApp|Twilio|Notif/i,
  sms: /Sms|Twilio|Otp|Notif/i,
};
