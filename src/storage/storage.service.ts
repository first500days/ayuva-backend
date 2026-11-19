import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

/**
 * Encrypted object store (TRD §2/§6, PRD FR-8.2). With S3_BUCKET set every
 * file lives in AWS S3 (also SSE-S3 encrypted); without it, files go to
 * UPLOAD_DIR on disk for local development. Either way the payload is
 * AES-256-GCM encrypted by the app first, and callers only ever see the opaque
 * `fileRef` key, never a path or URL.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly uploadDir: string;
  private readonly key: Buffer;
  private readonly bucket?: string;
  private readonly s3?: S3Client;

  constructor(config: ConfigService) {
    this.uploadDir = config.get<string>('storage.uploadDir')!;
    this.key = Buffer.from(config.get<string>('storage.encryptionKey')!, 'hex');
    this.bucket = config.get<string>('storage.s3Bucket') || undefined;
    if (this.bucket) {
      this.s3 = new S3Client({
        region: config.get<string>('storage.s3Region'),
      });
    } else if (config.get<string>('nodeEnv') === 'production') {
      this.logger.warn(
        'S3_BUCKET is not set in production — uploads are going to local disk.',
      );
    }
  }

  /**
   * `name` ends up in the object key, so callers pass a system-generated name
   * (never a patient's device filename). `folder` separates object classes,
   * e.g. patient records from partner credential documents.
   */
  async upload(
    buffer: Buffer,
    name: string,
    ownerId: string,
    folder: 'records' | 'credentials' = 'records',
  ): Promise<string> {
    const safeName = name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const fileRef = `${folder}/${ownerId}/${randomUUID()}-${safeName}`;

    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
    const body = Buffer.concat([iv, cipher.getAuthTag(), encrypted]);

    if (this.s3) {
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: fileRef,
          Body: body,
          ContentType: 'application/octet-stream',
          ServerSideEncryption: 'AES256',
        }),
      );
      return fileRef;
    }

    const destPath = join(this.uploadDir, fileRef);
    await mkdir(dirname(destPath), { recursive: true });
    await writeFile(destPath, body);
    return fileRef;
  }

  async read(fileRef: string): Promise<Buffer> {
    const raw = await this.readRaw(fileRef);
    const iv = raw.subarray(0, IV_LENGTH);
    const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + 16);
    const encrypted = raw.subarray(IV_LENGTH + 16);

    const decipher = createDecipheriv(ALGORITHM, this.key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]);
  }

  /** Deletes the stored object. A missing file is not an error — the goal state is "gone". */
  async remove(fileRef: string): Promise<void> {
    if (this.s3) {
      // S3 deletes are idempotent: a missing key succeeds.
      await this.s3.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: fileRef }),
      );
    }
    // Also clear any pre-S3 copy still on the disk volume.
    await rm(join(this.uploadDir, fileRef), { force: true });
  }

  private async readRaw(fileRef: string): Promise<Buffer> {
    if (!this.s3) return readFile(join(this.uploadDir, fileRef));
    try {
      const out = await this.s3.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: fileRef }),
      );
      return Buffer.from(await out.Body!.transformToByteArray());
    } catch (err) {
      // Files uploaded before the move to S3 still sit on the disk volume.
      if ((err as { name?: string }).name !== 'NoSuchKey') throw err;
      return readFile(join(this.uploadDir, fileRef));
    }
  }
}
