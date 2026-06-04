import { randomBytes } from 'crypto';
import { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { s3 } from '../config/storage';
import { config } from '../config';
import * as repo from '../repositories/file.repository';
import type { JwtPayload } from '@fadl/types';

const ALLOWED_MIME = new Set([
  'application/pdf', 'image/jpeg', 'image/png', 'image/webp',
  'image/gif', 'application/dicom', 'text/plain',
]);

const initiateSchema = z.object({
  originalName: z.string().min(1).max(500),
  mimeType:     z.string().refine((m) => ALLOWED_MIME.has(m), 'Unsupported file type'),
  sizeBytes:    z.number().int().positive().max(50 * 1024 * 1024), // 50 MB max
  entityType:   z.enum(['encounter','patient','prescription','lab_result','imaging','invoice','other']).default('other'),
  entityId:     z.string().uuid().optional(),
  description:  z.string().max(1000).optional(),
});

const listQuerySchema = z.object({
  entityType: z.string().optional(),
  entityId:   z.string().uuid().optional(),
});

export async function initiateUpload(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const user = request.user as JwtPayload;
  const input = initiateSchema.parse(request.body);

  const ext = input.originalName.split('.').pop() ?? 'bin';
  const fileKey = `branch-${user.branchId ?? 1}/${input.entityType}/${input.entityId ?? 'general'}/${Date.now()}-${randomBytes(6).toString('hex')}.${ext}`;

  // Generate presigned PUT URL
  const putUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({
      Bucket:      config.MINIO_BUCKET,
      Key:         fileKey,
      ContentType: input.mimeType,
    }),
    { expiresIn: 600 }, // 10 min to upload
  );

  // Pre-register the file record
  const record = await repo.createFileRecord({
    fileKey,
    originalName: input.originalName,
    mimeType:     input.mimeType,
    sizeBytes:    input.sizeBytes,
    entityType:   input.entityType,
    entityId:     input.entityId,
    description:  input.description,
    uploadedBy:   user.sub,
    branchId:     user.branchId ?? 1,
  });

  // Replace internal MinIO hostname with public URL so browsers can reach it
  const publicPutUrl = config.MINIO_PUBLIC_URL
    ? putUrl.replace(/^https?:\/\/[^/]+/, config.MINIO_PUBLIC_URL)
    : putUrl;

  return reply.status(201).send({
    success: true,
    data: { fileId: record.id, uploadUrl: publicPutUrl, fileKey, expiresIn: 600 },
  });
}

export async function getDownloadUrl(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { id } = request.params as { id: string };
  const record = await repo.findFileById(id);

  if (!record) {
    return reply.status(404).send({ success: false, error: { code: 'FILE_NOT_FOUND', message: 'File not found' } });
    return;
  }

  const url = await getSignedUrl(
    s3,
    new GetObjectCommand({
      Bucket:                     config.MINIO_BUCKET,
      Key:                        record.fileKey,
      ResponseContentDisposition: `inline; filename="${record.originalName}"`,
    }),
    { expiresIn: config.PRESIGN_TTL_SECS },
  );

  const publicUrl = config.MINIO_PUBLIC_URL
    ? url.replace(/^https?:\/\/[^/]+/, config.MINIO_PUBLIC_URL)
    : url;

  return reply.send({ success: true, data: { ...record, downloadUrl: publicUrl, expiresIn: config.PRESIGN_TTL_SECS } });
}

export async function listFiles(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { entityType, entityId } = listQuerySchema.parse(request.query);

  if (!entityType || !entityId) {
    return reply.status(400).send({ success: false, error: { code: 'BAD_REQUEST', message: 'entityType and entityId are required' } });
    return;
  }

  const files = await repo.listFilesByEntity(entityType, entityId);
  return reply.send({ success: true, data: files });
}

export async function deleteFile(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { id } = request.params as { id: string };
  const record = await repo.findFileById(id);

  if (!record) {
    return reply.status(404).send({ success: false, error: { code: 'FILE_NOT_FOUND', message: 'File not found' } });
    return;
  }

  // Soft delete in DB first — prevents orphaned MinIO objects if subsequent call fails
  await repo.softDeleteFile(id);

  // Delete from MinIO
  await s3.send(new DeleteObjectCommand({ Bucket: config.MINIO_BUCKET, Key: record.fileKey }));
  return reply.status(204).send();
}
