import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import type { IncomingMessage, Server } from 'http';
import type { Duplex } from 'stream';
import { WebSocket, WebSocketServer } from 'ws';
import { VoiceService } from './voice.service';

const PATHS = new Set(['/voice/stream', '/api/v1/voice/stream']);

/**
 * The WebSocket endpoint Twilio ConversationRelay connects to. Attached to the
 * API's own HTTP server (same port, no separate gateway process). Connections
 * are anonymous until the first frame proves a token we issued (see VoiceService).
 */
@Injectable()
export class VoiceStreamServer implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(VoiceStreamServer.name);
  private wss?: WebSocketServer;
  private server?: Server;
  private onUpgrade?: (req: IncomingMessage, socket: Duplex, head: Buffer) => void;

  constructor(
    private readonly adapterHost: HttpAdapterHost,
    private readonly voice: VoiceService,
  ) {}

  onApplicationBootstrap() {
    this.server = this.adapterHost.httpAdapter?.getHttpServer?.() as Server | undefined;
    if (!this.server) return;
    const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
    this.wss = wss;

    this.onUpgrade = (req, socket, head) => {
      const path = (req.url ?? '').split('?')[0] ?? '';
      if (!PATHS.has(path)) return;
      const max = Number(process.env.VOICE_MAX_CALLS) || 100;
      if (wss.clients.size >= max) {
        socket.write('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n');
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => this.connect(ws));
    };
    this.server.on('upgrade', this.onUpgrade);
  }

  private connect(ws: WebSocket) {
    const call = this.voice.openCall({
      send: (data) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(data);
      },
      close: () => ws.close(),
    });
    ws.on('message', (data) => {
      void call.onMessage(data.toString()).catch((err) => this.logger.error(`Voice frame failed: ${(err as Error).message}`));
    });
    ws.on('close', () => void call.onClose());
    ws.on('error', (err) => this.logger.warn(`Voice socket error: ${err.message}`));
  }

  onApplicationShutdown() {
    if (this.server && this.onUpgrade) this.server.off('upgrade', this.onUpgrade);
    for (const c of this.wss?.clients ?? []) c.terminate();
    this.wss?.close();
  }
}
