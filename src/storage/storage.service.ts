import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

/**
 * Stand-in for the S3-compatible encrypted object store (TRD §2/§6, PRD FR-8.2).
 * Files are AES-256-GCM encrypted at rest under UPLOAD_DIR. Swap this
 * implementation for a real S3 client later — callers only ever see the
 * opaque `fileRef` key, never a filesystem path.
 */
@Injectable()
export class StorageService {
  private readonly uploadDir: string;
  private readonly key: Buffer;

  constructor(config: ConfigService) {
    this.uploadDir = config.get<string>('storage.uploadDir')!;
    this.key = Buffer.from(config.get<string>('storage.encryptionKey')!, 'hex');
  }

  async upload(
    buffer: Buffer,
    originalName: string,
    ownerId: string,
  ): Promise<string> {
    const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const fileRef = `records/${ownerId}/${randomUUID()}-${safeName}`;
    const destPath = join(this.uploadDir, fileRef);

    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
    const authTag = cipher.getAuthTag();

    await mkdir(join(this.uploadDir, 'records', ownerId), { recursive: true });
    await writeFile(destPath, Buffer.concat([iv, authTag, encrypted]));

    return fileRef;
  }

  async read(fileRef: string): Promise<Buffer> {
    const raw = await readFile(join(this.uploadDir, fileRef));
    const iv = raw.subarray(0, IV_LENGTH);
    const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + 16);
    const encrypted = raw.subarray(IV_LENGTH + 16);

    const decipher = createDecipheriv(ALGORITHM, this.key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]);
  }
}
