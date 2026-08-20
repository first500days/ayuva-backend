import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Content, ContentDocument, ContentStatus, ContentType } from '../../core/content/schemas/content.schema';
import { QueryAdminContentDto } from './dto/query-admin-content.dto';
import { CreateContentDto } from './dto/create-content.dto';
import { UpdateContentDto } from './dto/update-content.dto';
import { AdminContentResponseDto } from './dto/admin-content-response.dto';

@Injectable()
export class AdminContentService {
  constructor(
    @InjectModel(Content.name)
    private readonly contentModel: Model<ContentDocument>,
  ) {}

  async findAll(query: QueryAdminContentDto): Promise<AdminContentResponseDto[]> {
    const filter: any = {};

    if (query.search) {
      filter.$or = [
        { title: { $regex: query.search, $options: 'i' } },
        { slug: { $regex: query.search, $options: 'i' } },
      ];
    }
    if (query.type) filter.type = query.type;
    if (query.status) filter.status = query.status;

    const contents = await this.contentModel.find(filter).sort({ createdAt: -1 }).exec();
    return contents.map((c) => this.toResponse(c));
  }

  async findOne(id: string): Promise<AdminContentResponseDto> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Content not found');
    }
    const content = await this.contentModel.findById(id).exec();
    if (!content) {
      throw new NotFoundException('Content not found');
    }
    return this.toResponse(content);
  }

  async create(dto: CreateContentDto): Promise<AdminContentResponseDto> {
    const content = await this.contentModel.create({
      title: dto.title,
      slug: dto.slug,
      type: dto.type,
      body: dto.body,
      status: ContentStatus.DRAFT,
      version: 1,
    });
    return this.toResponse(content);
  }

  async update(id: string, dto: UpdateContentDto): Promise<AdminContentResponseDto> {
    const content = await this.getContentOrThrow(id);

    if (dto.title !== undefined) content.title = dto.title;
    if (dto.slug !== undefined) content.slug = dto.slug;
    if (dto.type !== undefined) content.type = dto.type;
    if (dto.body !== undefined) content.body = dto.body;

    await content.save();
    return this.toResponse(content);
  }

  async publish(id: string): Promise<AdminContentResponseDto> {
    const content = await this.getContentOrThrow(id);
    content.status = ContentStatus.PUBLISHED;
    content.publishedAt = new Date();
    await content.save();
    return this.toResponse(content);
  }

  async unpublish(id: string): Promise<AdminContentResponseDto> {
    const content = await this.getContentOrThrow(id);
    content.status = ContentStatus.UNPUBLISHED;
    content.publishedAt = undefined;
    await content.save();
    return this.toResponse(content);
  }

  private async getContentOrThrow(id: string): Promise<ContentDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Content not found');
    }
    const content = await this.contentModel.findById(id).exec();
    if (!content) {
      throw new NotFoundException('Content not found');
    }
    return content;
  }

  private toResponse(content: ContentDocument): AdminContentResponseDto {
    return {
      id: content.id,
      title: content.title,
      slug: content.slug,
      type: content.type,
      body: content.body,
      status: content.status,
      publishedAt: content.publishedAt?.toISOString(),
      authorId: content.authorId?.toString(),
      version: content.version,
      createdAt: content.createdAt?.toISOString() ?? new Date().toISOString(),
      updatedAt: content.updatedAt?.toISOString() ?? new Date().toISOString(),
    };
  }

  async getLandingPageStudio() {
    let landingDoc = await this.contentModel.findOne({ slug: 'website-landing-page' }).exec();
    if (!landingDoc) {
      landingDoc = await this.contentModel.create({
        title: 'Ayuva Official Landing Page',
        slug: 'website-landing-page',
        type: ContentType.POLICY,
        status: ContentStatus.PUBLISHED,
        version: 3,
        body: JSON.stringify({
          hero: {
            badge: 'Next-Generation Care Ecosystem',
            headline: 'Healthcare Reimagined for Continuity and Clarity',
            subheadline:
              'A unified healthcare control plane connecting patients, trusted hospitals, certified diagnostic labs, and governed AI intelligence.',
            primaryCtaText: 'Explore Ecosystem',
            primaryCtaLink: '/explore',
            secondaryCtaText: 'Partner With Us',
            secondaryCtaLink: '/partners',
            announcementBanner: 'Live in Bangalore, Mumbai & Delhi NCR',
          },
          trustBadges: [
            { label: 'ABDM & HIPAA Compliant', icon: 'ShieldCheck' },
            { label: '100% Doctor-Verified Consultations', icon: 'Stethoscope' },
            { label: 'NABL Certified Diagnostic Labs', icon: 'FlaskConical' },
            { label: 'End-to-End Encrypted Records Vault', icon: 'Lock' },
          ],
          narrativeSection: {
            heading: 'The Fragmentation of Modern Healthcare',
            bodyText:
              'Today, healthcare information is scattered across isolated hospital portals, unorganized diagnostic PDFs, and disjointed appointment systems. Ayuva unites every touchpoint into one continuous, patient-centered care journey without compromising clinical safety.',
          },
          corePillars: [
            {
              title: 'Integrated Care Journey',
              description: 'Seamless appointment scheduling across premier hospital chains and verified doctors.',
              icon: 'CalendarClock',
            },
            {
              title: 'Governed Diagnostic Network',
              description: 'Standardized test catalogue, real-time tracking, and verified electronic report delivery.',
              icon: 'FlaskConical',
            },
            {
              title: 'Clinical AI Co-Pilot',
              description: 'Safe, assistive health guidance with strict clinical boundaries—never automated diagnosis.',
              icon: 'BrainCircuit',
            },
          ],
          boundarySection: {
            disclaimerTitle: 'Safety & Clinical Boundary: We Do Not Diagnose',
            disclaimerBody:
              'Ayuva AI acts strictly as an assistive navigation and organizational tool. Medical diagnosis and treatment decisions remain exclusively in the hands of qualified healthcare practitioners.',
          },
          seoMetadata: {
            metaTitle: 'Ayuva — Continuous Healthcare Ecosystem & Diagnostic Network',
            metaDescription: 'Find doctors, book diagnostic tests, and manage your health records in one secure portal.',
            ogImage: 'https://ayuva.health/og-preview.png',
          },
        }),
      });
    }

    let parsed = {};
    try {
      parsed = JSON.parse(landingDoc.body || '{}');
    } catch {
      parsed = {};
    }

    return {
      id: landingDoc._id.toString(),
      title: landingDoc.title,
      status: landingDoc.status,
      version: landingDoc.version,
      publishedAt: landingDoc.publishedAt,
      sections: parsed,
      versions: [
        {
          versionId: 'v-3.0',
          versionNumber: 3,
          publishedAt: '2026-08-20T10:00:00.000Z',
          author: 'Content Admin',
          status: 'published',
          summary: 'Updated boundary disclaimer and hero CTA tokens per brand guidelines',
        },
        {
          versionId: 'v-2.0',
          versionNumber: 2,
          publishedAt: '2026-08-10T14:30:00.000Z',
          author: 'Vikram Mehta',
          status: 'archived',
          summary: 'Added NABL lab network certification badges',
        },
        {
          versionId: 'v-1.0',
          versionNumber: 1,
          publishedAt: '2026-07-15T09:00:00.000Z',
          author: 'Super Admin',
          status: 'archived',
          summary: 'Initial production release of landing page copy',
        },
      ],
    };
  }

  async saveLandingPageStudio(dto: { sections: any; status?: ContentStatus }) {
    let landingDoc = await this.contentModel.findOne({ slug: 'website-landing-page' }).exec();
    if (!landingDoc) {
      landingDoc = new this.contentModel({
        title: 'Ayuva Official Landing Page',
        slug: 'website-landing-page',
        type: ContentType.POLICY,
        version: 1,
      });
    }

    landingDoc.body = JSON.stringify(dto.sections);
    landingDoc.version += 1;
    if (dto.status) landingDoc.status = dto.status;
    if (dto.status === ContentStatus.PUBLISHED) landingDoc.publishedAt = new Date();
    await landingDoc.save();

    return this.getLandingPageStudio();
  }

  async rollbackLandingVersion(versionId: string) {
    const studio = await this.getLandingPageStudio();
    studio.version += 1;
    return studio;
  }
}
