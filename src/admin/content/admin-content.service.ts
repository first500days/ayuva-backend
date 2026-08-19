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
      status: content.status,
      publishedAt: content.publishedAt?.toISOString(),
      version: content.version,
    };
  }
}
