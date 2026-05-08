import { S3Client, CreateBucketCommand, HeadBucketCommand } from '@aws-sdk/client-s3';
import { config } from './index';

export const s3 = new S3Client({
  endpoint: `http://${config.MINIO_ENDPOINT}:${config.MINIO_PORT}`,
  region: 'us-east-1',
  credentials: {
    accessKeyId:     config.MINIO_ACCESS_KEY,
    secretAccessKey: config.MINIO_SECRET_KEY,
  },
  forcePathStyle: true,
});

export async function ensureBucket(): Promise<void> {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: config.MINIO_BUCKET }));
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket: config.MINIO_BUCKET }));
  }
}
