import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpAdapterHost } from '@nestjs/core';
import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import type { WebSocketServer } from 'ws';

/**
 * Hands WebSocket upgrades on the API's HTTP port to whichever socket server
 * owns the path. Render forwards one public HTTP port per service, so every
 * socket has to share it.
 */
@Injectable()
export class WsUpgradeRouter implements OnApplicationBootstrap {
  private readonly routes = new Map<string, WebSocketServer>();

  constructor(
    private readonly host: HttpAdapterHost,
    private readonly config: ConfigService,
  ) {}

  add(path: string, server: WebSocketServer): void {
    this.routes.set(path, server);
  }

  onApplicationBootstrap(): void {
    const http = this.host.httpAdapter.getHttpServer() as Server;
    http.on('upgrade', (req, socket, head) => this.route(req, socket, head));
  }

  private route(req: IncomingMessage, socket: Duplex, head: Buffer): void {
    const path = new URL(req.url ?? '/', 'http://localhost').pathname;
    const server = this.routes.get(path);
    if (!server) return this.refuse(socket, '404 Not Found');
    if (!this.originAllowed(req)) return this.refuse(socket, '403 Forbidden');
    server.handleUpgrade(req, socket, head, (ws) =>
      server.emit('connection', ws, req),
    );
  }

  /** Same allowlist as CORS. Devices and bridges send no Origin, and authenticate with a key. */
  private originAllowed(req: IncomingMessage): boolean {
    const origin = req.headers.origin;
    if (!origin || this.config.get<string>('nodeEnv') !== 'production')
      return true;
    const allowed = this.config.get<string>('corsAllowedOrigins') ?? '';
    return allowed
      .split(',')
      .map((o) => o.trim())
      .includes(origin);
  }

  private refuse(socket: Duplex, status: string): void {
    socket.write(`HTTP/1.1 ${status}\r\nConnection: close\r\n\r\n`);
    socket.destroy();
  }
}
