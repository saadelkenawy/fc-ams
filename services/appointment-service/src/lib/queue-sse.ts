'use strict';
import type { FastifyReply } from 'fastify';

// SSE registry keyed by "doctorId:date:branchId"
const sseClients = new Map<string, Set<FastifyReply>>();

function key(doctorId: string, date: string, branchId: number): string {
  return `${doctorId}:${date}:${branchId}`;
}

export function registerClient(doctorId: string, date: string, branchId: number, reply: FastifyReply): () => void {
  const k = key(doctorId, date, branchId);
  if (!sseClients.has(k)) sseClients.set(k, new Set());
  sseClients.get(k)!.add(reply);
  return () => { sseClients.get(k)?.delete(reply); };
}

export function broadcast(doctorId: string, date: string, branchId: number, event: string, data: unknown): void {
  const k = key(doctorId, date, branchId);
  const clients = sseClients.get(k);
  if (!clients?.size) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const reply of clients) {
    try { reply.raw.write(payload); } catch { clients.delete(reply); }
  }
}
