import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from 'node:crypto';
import { Model, Types } from 'mongoose';
import { AuditLogService } from '../../../audit-log/audit-log.service';
import { AuditAction } from '../../../audit-log/schemas/audit-log.schema';
import { PartnerActor } from '../../rbac/partner-perm.guard';
import { assertSafeWebhookUrl } from '../../notify/webhook-url';
import {
  FhirConnection,
  FhirConnectionDocument,
} from './fhir-connection.schema';
import {
  CreateFhirConnectionDto,
  FhirSearchDto,
  UpdateFhirConnectionDto,
} from './fhir.dto';
import {
  FhirReport,
  FhirValue,
  mapObservations,
  mapReports,
  nextPage,
} from './fhir-mapping';

const CIPHER = 'aes-256-gcm';
const IV_BYTES = 12;
const TIMEOUT_MS = 20_000;
const MAX_RESPONSE_CHARS = 5_000_000;
const MAX_PAGES = 3;
const PAGE_SIZE = 50;

interface CachedToken {
  value: string;
  expiresAt: number;
}

/**
 * FHIR R4 client for hospital systems: searches DiagnosticReport and
 * Observation by patient or encounter. Results are shown to lab staff to bring
 * into a report; nothing is written without them.
 */
@Injectable()
export class PartnerFhirService {
  private readonly tokens = new Map<string, CachedToken>();

  constructor(
    @InjectModel(FhirConnection.name)
    private readonly connections: Model<FhirConnectionDocument>,
    private readonly config: ConfigService,
    private readonly audit: AuditLogService,
  ) {}

  async list(actor: PartnerActor) {
    const rows = await this.connections
      .find({ providerId: actor.provider._id })
      .sort({ active: -1, name: 1 })
      .exec();
    return rows.map((c) => this.view(c));
  }

  async create(actor: PartnerActor, dto: CreateFhirConnectionDto) {
    this.assertCredentials(dto);
    const baseUrl = dto.baseUrl.trim().replace(/\/+$/, '');
    await this.assertSafe(baseUrl);
    if (dto.tokenUrl) await this.assertSafe(dto.tokenUrl);
    const row = await this.connections.create({
      providerId: actor.provider._id,
      name: dto.name.trim(),
      baseUrl,
      authType: dto.authType,
      username: dto.username?.trim() || undefined,
      secretEnc: dto.secret ? this.encrypt(dto.secret) : undefined,
      tokenUrl: dto.tokenUrl?.trim() || undefined,
      scope: dto.scope?.trim() || undefined,
    });
    await this.record(actor, row, `FHIR connection added: ${row.name}`);
    return this.view(row);
  }

  async update(actor: PartnerActor, id: string, dto: UpdateFhirConnectionDto) {
    const row = await this.load(actor, id);
    if (dto.name !== undefined) row.name = dto.name.trim();
    if (dto.active !== undefined) row.active = dto.active;
    await row.save();
    this.tokens.delete(row.id);
    await this.record(actor, row, `FHIR connection updated: ${row.name}`);
    return this.view(row);
  }

  async remove(actor: PartnerActor, id: string) {
    const row = await this.load(actor, id);
    await row.deleteOne();
    this.tokens.delete(row.id);
    await this.record(actor, row, `FHIR connection removed: ${row.name}`);
    return { removed: true };
  }

  /** Reads the server's capability statement: proves the address and sign-in work. */
  async test(actor: PartnerActor, id: string) {
    const row = await this.load(actor, id);
    const statement = (await this.get(row, `${row.baseUrl}/metadata`)) as {
      resourceType?: string;
      fhirVersion?: string;
      software?: { name?: string };
    };
    if (statement?.resourceType !== 'CapabilityStatement')
      throw new BadGatewayException('That address did not answer as a FHIR server');
    return {
      ok: true,
      fhirVersion: statement.fhirVersion ?? null,
      software: statement.software?.name ?? null,
    };
  }

  async search(
    actor: PartnerActor,
    id: string,
    dto: FhirSearchDto,
  ): Promise<{ reports: FhirReport[]; observations: FhirValue[] }> {
    const patient = dto.patient?.trim();
    const encounter = dto.encounter?.trim();
    if (!patient && !encounter)
      throw new BadRequestException('Enter a patient ID or an encounter ID');
    const row = await this.load(actor, id);
    if (!row.active)
      throw new BadRequestException('This connection is switched off');

    const params = new URLSearchParams({ _count: String(PAGE_SIZE) });
    if (patient) params.set('patient', patient);
    if (encounter) params.set('encounter', encounter);
    const reportParams = new URLSearchParams(params);
    reportParams.set('_include', 'DiagnosticReport:result');

    const [reportPages, observationPages] = await Promise.all([
      this.pages(row, `${row.baseUrl}/DiagnosticReport?${reportParams}`),
      this.pages(row, `${row.baseUrl}/Observation?${params}`),
    ]);
    const reports = reportPages.flatMap(mapReports);
    const observations = observationPages.flatMap(mapObservations);

    row.lastUsedAt = new Date();
    await row.save();
    await this.record(
      actor,
      row,
      `FHIR search on ${row.name}${patient ? `, patient ${patient}` : ''}${encounter ? `, encounter ${encounter}` : ''}: ${reports.length} report(s), ${observations.length} result(s)`,
    );
    return { reports, observations };
  }

  private async pages(row: FhirConnectionDocument, first: string) {
    const origin = new URL(row.baseUrl).origin;
    const pages: unknown[] = [];
    let url: string | null = first;
    while (url && pages.length < MAX_PAGES) {
      const page: unknown = await this.get(row, url);
      pages.push(page);
      const next = nextPage(page);
      // A paging link must not carry our credentials to some other server.
      url = next && this.sameOrigin(next, origin) ? next : null;
    }
    return pages;
  }

  private sameOrigin(url: string, origin: string): boolean {
    try {
      return new URL(url).origin === origin;
    } catch {
      return false;
    }
  }

  private async get(row: FhirConnectionDocument, url: string): Promise<unknown> {
    await this.assertSafe(url);
    let res: Response;
    try {
      res = await fetch(url, {
        headers: {
          Accept: 'application/fhir+json',
          ...(await this.authHeader(row)),
        },
        redirect: 'error',
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      if (err instanceof BadGatewayException) throw err;
      throw new BadGatewayException('The hospital system could not be reached');
    }
    if (res.status === 401 || res.status === 403) this.tokens.delete(row.id);
    if (!res.ok)
      throw new BadGatewayException(
        `The hospital system answered with an error (${res.status})`,
      );
    const body = await res.text();
    if (body.length > MAX_RESPONSE_CHARS)
      throw new BadGatewayException('The hospital system sent too much data');
    try {
      return JSON.parse(body) as unknown;
    } catch {
      throw new BadGatewayException('The hospital system did not send FHIR JSON');
    }
  }

  private async authHeader(
    row: FhirConnectionDocument,
  ): Promise<Record<string, string>> {
    const secret = row.secretEnc ? this.decrypt(row.secretEnc) : '';
    switch (row.authType) {
      case 'bearer':
        return { Authorization: `Bearer ${secret}` };
      case 'basic':
        return {
          Authorization: `Basic ${Buffer.from(`${row.username ?? ''}:${secret}`).toString('base64')}`,
        };
      case 'client_credentials':
        return {
          Authorization: `Bearer ${await this.accessToken(row, secret)}`,
        };
      default:
        return {};
    }
  }

  private async accessToken(
    row: FhirConnectionDocument,
    secret: string,
  ): Promise<string> {
    const cached = this.tokens.get(row.id);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    await this.assertSafe(row.tokenUrl ?? '');
    const form = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: row.username ?? '',
      client_secret: secret,
      ...(row.scope && { scope: row.scope }),
    });
    let res: Response;
    try {
      res = await fetch(row.tokenUrl as string, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: form,
        redirect: 'error',
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      throw new BadGatewayException('The hospital sign-in server could not be reached');
    }
    if (!res.ok)
      throw new BadGatewayException(
        `The hospital sign-in server refused the credentials (${res.status})`,
      );
    const body = (await res.json()) as {
      access_token?: string;
      expires_in?: number;
    };
    if (!body.access_token)
      throw new BadGatewayException('The hospital sign-in server sent no token');
    const lifetime = (body.expires_in ?? 300) * 1000;
    this.tokens.set(row.id, {
      value: body.access_token,
      expiresAt: Date.now() + Math.max(0, lifetime - 60_000),
    });
    return body.access_token;
  }

  private assertCredentials(dto: CreateFhirConnectionDto) {
    if (dto.authType === 'none') return;
    if (!dto.secret)
      throw new BadRequestException('Enter the secret for this sign-in type');
    if (dto.authType === 'basic' && !dto.username)
      throw new BadRequestException('Enter the username');
    if (dto.authType === 'client_credentials' && (!dto.username || !dto.tokenUrl))
      throw new BadRequestException('Enter the client ID and the token URL');
  }

  /** The hospital's address comes from a person, so it can't be allowed to reach inside our network. */
  private assertSafe(url: string) {
    return assertSafeWebhookUrl(
      url,
      this.config.get<string>('nodeEnv') !== 'production',
    );
  }

  private get key(): Buffer {
    return Buffer.from(this.config.get<string>('storage.encryptionKey')!, 'hex');
  }

  private encrypt(secret: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(CIPHER, this.key, iv);
    const data = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64');
  }

  private decrypt(payload: string): string {
    const raw = Buffer.from(payload, 'base64');
    const decipher = createDecipheriv(CIPHER, this.key, raw.subarray(0, IV_BYTES));
    decipher.setAuthTag(raw.subarray(IV_BYTES, IV_BYTES + 16));
    return Buffer.concat([
      decipher.update(raw.subarray(IV_BYTES + 16)),
      decipher.final(),
    ]).toString('utf8');
  }

  private async load(actor: PartnerActor, id: string) {
    if (!Types.ObjectId.isValid(id))
      throw new NotFoundException('Connection not found');
    const row = await this.connections
      .findOne({ _id: id, providerId: actor.provider._id })
      .exec();
    if (!row) throw new NotFoundException('Connection not found');
    return row;
  }

  private record(
    actor: PartnerActor,
    row: FhirConnectionDocument,
    label: string,
  ) {
    return this.audit.record({
      actorId: actor.userId,
      action: AuditAction.PARTNER_LAB_ANALYSER,
      targetType: 'FhirConnection',
      targetId: row.id,
      metadata: { providerId: actor.provider.id, label },
      ipAddress: actor.ip,
    });
  }

  private view(c: FhirConnectionDocument) {
    return {
      id: c.id,
      name: c.name,
      baseUrl: c.baseUrl,
      authType: c.authType,
      active: c.active,
      lastUsedAt: c.lastUsedAt?.toISOString() ?? null,
    };
  }
}
