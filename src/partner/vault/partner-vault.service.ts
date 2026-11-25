import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { AuditAction } from '../../audit-log/schemas/audit-log.schema';
import { buildSafeRegex } from '../../common/utils/regex.util';
import {
  buildZip,
  readZip,
  ZipError,
  type ZipEntry,
} from '../../common/utils/zip';
import { StorageService } from '../../storage/storage.service';
import type { PartnerActor } from '../rbac/partner-perm.guard';
import { ResearchQueryDto, SaveVaultNoteDto } from './dto/vault.dto';
import { searchLiterature } from './research';
import { VaultFile, VaultFileDocument } from './schemas/vault-file.schema';
import { VaultNote, VaultNoteDocument } from './schemas/vault-note.schema';

export const VAULT_LIMITS = {
  fileBytes: 20 * 1024 * 1024,
  totalBytes: 500 * 1024 * 1024,
  notes: 5000,
  importBytes: 100 * 1024 * 1024,
};

/** What a file is, from its first bytes (never the name or the browser's claim). */
export function sniffMime(buf: Buffer, name: string): string | null {
  if (buf.subarray(0, 5).toString('latin1') === '%PDF-')
    return 'application/pdf';
  if (buf.length > 8 && buf.readUInt32BE(0) === 0x89504e47) return 'image/png';
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)
    return 'image/jpeg';
  if (
    buf.subarray(0, 4).toString('latin1') === 'RIFF' &&
    buf.subarray(8, 12).toString('latin1') === 'WEBP'
  )
    return 'image/webp';
  if (/\.(txt|md)$/i.test(name) && !buf.includes(0)) return 'text/plain';
  return null;
}

const tidyTags = (tags?: string[]) =>
  [
    ...new Set((tags ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean)),
  ].slice(0, 20);

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'note';

/**
 * The Doctor's Vault: a prescriber's own notepad, files (their PDF
 * guidelines) and literature search. Private to the login (nobody else in
 * the organisation can read it, admins included) and portable: export is a
 * ZIP of Markdown notes and files, which imports into their account at
 * another organisation. Patient details don't belong here; the page says so.
 */
@Injectable()
export class PartnerVaultService {
  private readonly logger = new Logger(PartnerVaultService.name);

  constructor(
    @InjectModel(VaultNote.name)
    private readonly noteModel: Model<VaultNoteDocument>,
    @InjectModel(VaultFile.name)
    private readonly fileModel: Model<VaultFileDocument>,
    private readonly storage: StorageService,
    private readonly audit: AuditLogService,
  ) {}

  // ── Notes ───────────────────────────────────────────────────────────────

  async notes(actor: PartnerActor, q: { q?: string; tag?: string }) {
    const filter: Record<string, unknown> = { ownerUserId: this.owner(actor) };
    if (q.tag) filter.tags = q.tag.toLowerCase();
    if (q.q?.trim()) {
      const re = buildSafeRegex(q.q);
      filter.$or = [{ title: re }, { body: re }, { tags: re }];
    }
    const rows = await this.noteModel
      .find(filter)
      .sort({ pinned: -1, updatedAt: -1 })
      .limit(1000)
      .exec();
    return rows.map((n) => this.noteView(n));
  }

  async createNote(actor: PartnerActor, dto: SaveVaultNoteDto) {
    const count = await this.noteModel.countDocuments({
      ownerUserId: this.owner(actor),
    });
    if (count >= VAULT_LIMITS.notes)
      throw new BadRequestException(
        `The vault holds up to ${VAULT_LIMITS.notes} notes`,
      );
    const n = await this.noteModel.create({
      ownerUserId: this.owner(actor),
      title: dto.title.trim(),
      body: dto.body ?? '',
      tags: tidyTags(dto.tags),
      pinned: dto.pinned ?? false,
      ...(dto.citation && { citation: dto.citation }),
    });
    return this.noteView(n);
  }

  async updateNote(actor: PartnerActor, id: string, dto: SaveVaultNoteDto) {
    const n = await this.ownNote(actor, id);
    n.title = dto.title.trim();
    if (dto.body !== undefined) n.body = dto.body;
    if (dto.tags !== undefined) n.tags = tidyTags(dto.tags);
    if (dto.pinned !== undefined) n.pinned = dto.pinned;
    if (dto.citation !== undefined) n.set('citation', dto.citation);
    await n.save();
    return this.noteView(n);
  }

  async deleteNote(actor: PartnerActor, id: string) {
    const n = await this.ownNote(actor, id);
    await n.deleteOne();
    return { id, removed: true };
  }

  // ── Files ───────────────────────────────────────────────────────────────

  async files(actor: PartnerActor) {
    const rows = await this.fileModel
      .find({ ownerUserId: this.owner(actor) })
      .sort({ createdAt: -1 })
      .exec();
    const used = rows.reduce((n, f) => n + f.size, 0);
    return {
      files: rows.map((f) => this.fileView(f)),
      usedBytes: used,
      limitBytes: VAULT_LIMITS.totalBytes,
    };
  }

  async upload(
    actor: PartnerActor,
    file: Express.Multer.File | undefined,
    tags?: string[],
  ) {
    if (!file?.buffer?.length) throw new BadRequestException('Choose a file');
    const f = await this.store(actor, file.buffer, file.originalname, tags);
    return this.fileView(f);
  }

  async download(actor: PartnerActor, id: string) {
    const f = await this.fileModel
      .findOne({ _id: this.id(id), ownerUserId: this.owner(actor) })
      .exec();
    if (!f) throw new NotFoundException('File not found');
    return {
      buffer: await this.storage.read(f.fileRef),
      name: f.name,
      mimeType: f.mimeType,
    };
  }

  async deleteFile(actor: PartnerActor, id: string) {
    const f = await this.fileModel
      .findOne({ _id: this.id(id), ownerUserId: this.owner(actor) })
      .exec();
    if (!f) throw new NotFoundException('File not found');
    await f.deleteOne();
    await this.storage
      .remove(f.fileRef)
      .catch((err: unknown) =>
        this.logger.warn(
          `Vault file ${f.id} removed, storage cleanup failed: ${String(err)}`,
        ),
      );
    return { id, removed: true };
  }

  // ── Research ────────────────────────────────────────────────────────────

  async research(dto: ResearchQueryDto) {
    try {
      return await searchLiterature(dto.q, dto.filter ?? 'all', dto.cursor);
    } catch (err) {
      this.logger.warn(`Literature search failed: ${String(err)}`);
      throw new BadGatewayException(
        'The literature search service is busy. Try again in a moment.',
      );
    }
  }

  // ── Export / import ─────────────────────────────────────────────────────

  async exportZip(actor: PartnerActor) {
    const owner = this.owner(actor);
    const [notes, files] = await Promise.all([
      this.noteModel.find({ ownerUserId: owner }).sort({ createdAt: 1 }).exec(),
      this.fileModel.find({ ownerUserId: owner }).sort({ createdAt: 1 }).exec(),
    ]);
    const entries: ZipEntry[] = [];
    const manifestNotes = notes.map((n, i) => {
      const path = `notes/${String(i + 1).padStart(3, '0')}-${slug(n.title)}.md`;
      const head = [
        '---',
        `title: ${JSON.stringify(n.title)}`,
        `tags: ${JSON.stringify(n.tags)}`,
        `pinned: ${n.pinned}`,
        `created: ${n.createdAt?.toISOString() ?? ''}`,
        `updated: ${n.updatedAt?.toISOString() ?? ''}`,
        ...(n.citation
          ? [`citation: ${JSON.stringify(this.plainCitation(n))}`]
          : []),
        '---',
        '',
      ].join('\n');
      entries.push({
        name: path,
        data: Buffer.from(`${head}${n.body}\n`, 'utf8'),
        date: n.updatedAt,
      });
      return {
        path,
        title: n.title,
        body: n.body,
        tags: n.tags,
        pinned: n.pinned,
        citation: n.citation ? this.plainCitation(n) : null,
        createdAt: n.createdAt?.toISOString() ?? null,
        updatedAt: n.updatedAt?.toISOString() ?? null,
      };
    });
    const usedNames = new Set<string>();
    const manifestFiles: {
      path: string;
      name: string;
      mimeType: string;
      tags: string[];
      createdAt: string | null;
    }[] = [];
    for (const f of files) {
      let name = f.name.replace(/[\\/:*?"<>|]/g, '_');
      for (let k = 2; usedNames.has(name.toLowerCase()); k++)
        name = name.replace(/(\.[^.]*)?$/, ` (${k})$1`);
      usedNames.add(name.toLowerCase());
      const path = `files/${name}`;
      try {
        entries.push({
          name: path,
          data: await this.storage.read(f.fileRef),
          date: f.createdAt,
        });
        manifestFiles.push({
          path,
          name: f.name,
          mimeType: f.mimeType,
          tags: f.tags,
          createdAt: f.createdAt?.toISOString() ?? null,
        });
      } catch (err) {
        this.logger.warn(
          `Vault file ${f.id} unreadable during export: ${String(err)}`,
        );
      }
    }
    const exportedAt = new Date();
    entries.unshift(
      {
        name: 'README.txt',
        data: Buffer.from(
          [
            `AYUVA Doctor's Vault — exported ${exportedAt.toISOString()} by ${actor.member.fullName}.`,
            '',
            'notes/  your notes as Markdown (open them in any text editor)',
            'files/  the files you uploaded',
            '',
            "To restore everything into an AYUVA account: Doctor's Vault → Import, and choose this ZIP.",
            '',
          ].join('\n'),
          'utf8',
        ),
      },
      {
        name: 'vault.json',
        data: Buffer.from(
          JSON.stringify(
            {
              format: 'ayuva-vault',
              version: 1,
              exportedAt,
              notes: manifestNotes,
              files: manifestFiles,
            },
            null,
            2,
          ),
          'utf8',
        ),
      },
    );
    await this.audit.record({
      actorId: actor.userId,
      action: AuditAction.PARTNER_VAULT_TRANSFER,
      targetType: 'VaultExport',
      metadata: {
        providerId: actor.provider.id,
        label: `Exported ${notes.length} notes, ${manifestFiles.length} files`,
      },
    });
    return {
      buffer: buildZip(entries),
      fileName: `Doctor's Vault ${exportedAt.toISOString().slice(0, 10)}.zip`,
    };
  }

  async importZip(actor: PartnerActor, file: Express.Multer.File | undefined) {
    if (!file?.buffer?.length)
      throw new BadRequestException('Choose the vault ZIP you exported');
    let entries: ZipEntry[];
    try {
      entries = readZip(file.buffer, {
        maxBytes: VAULT_LIMITS.totalBytes,
        maxEntries: VAULT_LIMITS.notes + 2000,
      });
    } catch (err) {
      throw new BadRequestException(
        err instanceof ZipError
          ? err.message
          : 'That file could not be read as a ZIP',
      );
    }
    const byName = new Map(entries.map((e) => [e.name, e.data]));
    const manifestRaw = byName.get('vault.json');
    if (!manifestRaw)
      throw new BadRequestException(
        "This isn't a Doctor's Vault export (vault.json is missing)",
      );
    let manifest: {
      format?: string;
      notes?: {
        title?: string;
        body?: string;
        tags?: string[];
        pinned?: boolean;
        citation?: Record<string, string> | null;
      }[];
      files?: { path?: string; name?: string; tags?: string[] }[];
    };
    try {
      manifest = JSON.parse(manifestRaw.toString('utf8')) as typeof manifest;
    } catch {
      throw new BadRequestException(
        "This vault export's vault.json is damaged",
      );
    }
    if (manifest.format !== 'ayuva-vault')
      throw new BadRequestException("This isn't a Doctor's Vault export");

    const owner = this.owner(actor);
    const existing = await this.noteModel.countDocuments({
      ownerUserId: owner,
    });
    const notes = (manifest.notes ?? [])
      .filter((n) => n.title?.trim())
      .slice(0, Math.max(0, VAULT_LIMITS.notes - existing));
    if (notes.length)
      await this.noteModel.insertMany(
        notes.map((n) => ({
          ownerUserId: owner,
          title: n.title!.trim().slice(0, 200),
          body: (n.body ?? '').slice(0, 100_000),
          tags: tidyTags(n.tags),
          pinned: !!n.pinned,
          ...(n.citation && { citation: n.citation }),
        })),
      );
    let filesAdded = 0;
    const skipped: string[] = [];
    for (const f of manifest.files ?? []) {
      const data = f.path ? byName.get(f.path) : undefined;
      if (!data || !f.name) continue;
      try {
        await this.store(actor, data, f.name, f.tags);
        filesAdded++;
      } catch (err) {
        skipped.push(`${f.name}: ${(err as Error).message}`);
      }
    }
    await this.audit.record({
      actorId: actor.userId,
      action: AuditAction.PARTNER_VAULT_TRANSFER,
      targetType: 'VaultImport',
      metadata: {
        providerId: actor.provider.id,
        label: `Imported ${notes.length} notes, ${filesAdded} files`,
      },
    });
    return { notesAdded: notes.length, filesAdded, skipped };
  }

  // ── helpers ─────────────────────────────────────────────────────────────

  private async store(
    actor: PartnerActor,
    buffer: Buffer,
    originalName: string,
    tags?: string[],
  ) {
    if (buffer.length > VAULT_LIMITS.fileBytes)
      throw new PayloadTooLargeException('Files can be up to 20 MB');
    const name = (originalName || 'file')
      .replace(/[\r\n]/g, ' ')
      .trim()
      .slice(0, 200);
    const mimeType = sniffMime(buffer, name);
    if (!mimeType)
      throw new BadRequestException(
        'The vault takes PDF, PNG, JPEG, WebP and text files',
      );
    const owner = this.owner(actor);
    const [{ used = 0 } = {}] = await this.fileModel
      .aggregate<{ used: number }>([
        { $match: { ownerUserId: owner } },
        { $group: { _id: null, used: { $sum: '$size' } } },
      ])
      .exec();
    if (used + buffer.length > VAULT_LIMITS.totalBytes)
      throw new PayloadTooLargeException(
        'Your vault is full (500 MB). Remove some files first.',
      );
    const fileRef = await this.storage.upload(
      buffer,
      'vault-file',
      actor.userId,
      'records',
    );
    return this.fileModel.create({
      ownerUserId: owner,
      name,
      mimeType,
      size: buffer.length,
      fileRef,
      tags: tidyTags(tags),
    });
  }

  private async ownNote(actor: PartnerActor, id: string) {
    const n = await this.noteModel
      .findOne({ _id: this.id(id), ownerUserId: this.owner(actor) })
      .exec();
    if (!n) throw new NotFoundException('Note not found');
    return n;
  }

  private plainCitation(n: VaultNoteDocument): Record<string, string> {
    const c = n.citation as unknown as
      { toObject?: () => Record<string, string> } | undefined;
    return c?.toObject ? c.toObject() : ((c ?? {}) as Record<string, string>);
  }

  private noteView(n: VaultNoteDocument) {
    return {
      id: n.id,
      title: n.title,
      body: n.body,
      tags: n.tags,
      pinned: n.pinned,
      citation: n.citation ? this.plainCitation(n) : null,
      createdAt: n.createdAt?.toISOString() ?? null,
      updatedAt: n.updatedAt?.toISOString() ?? null,
    };
  }

  private fileView(f: VaultFileDocument) {
    return {
      id: f.id,
      name: f.name,
      mimeType: f.mimeType,
      size: f.size,
      tags: f.tags,
      createdAt: f.createdAt?.toISOString() ?? null,
    };
  }

  /** The vault belongs to the sign-in, not the organisation. */
  private owner(actor: PartnerActor) {
    return new Types.ObjectId(actor.userId);
  }

  private id(id: string) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Not found');
    return new Types.ObjectId(id);
  }
}
