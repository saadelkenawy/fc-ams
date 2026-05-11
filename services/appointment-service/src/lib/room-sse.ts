'use strict';
import type { FastifyReply } from 'fastify';

// SSE registry keyed by branchId — room status is branch-wide
const sseClients = new Map<number, Set<FastifyReply>>();

export function registerRoomClient(branchId: number, reply: FastifyReply): () => void {
  if (!sseClients.has(branchId)) sseClients.set(branchId, new Set());
  sseClients.get(branchId)!.add(reply);
  return () => { sseClients.get(branchId)?.delete(reply); };
}

export function broadcastRoom(branchId: number, event: string, data: unknown): void {
  const clients = sseClients.get(branchId);
  if (!clients?.size) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const reply of clients) {
    try { reply.raw.write(payload); } catch { clients.delete(reply); }
  }
}
