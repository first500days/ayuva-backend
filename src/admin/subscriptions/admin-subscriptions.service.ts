import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Plan,
  PlanDocument,
  PlanTier,
  Subscription,
  SubscriptionDocument,
  SubscriptionStatus,
} from './schemas/subscription.schema';
import { User, UserDocument } from '../../core/users/schemas/user.schema';
import {
  AssignSubscriptionDto,
  CreatePlanDto,
  QuerySubscriptionsDto,
  UpdatePlanDto,
} from './dto/subscriptions.dto';

const DEFAULT_PLANS: CreatePlanDto[] = [
  {
    name: 'Free',
    tier: PlanTier.FREE,
    priceMonthly: 0,
    features: ['Medical Vault (basic)', 'Book appointments', '1 family member'],
    limits: { familyMembers: 1, storageGb: 1, aiSimplifications: 5 },
  },
  {
    name: 'Premium',
    tier: PlanTier.PREMIUM,
    priceMonthly: 299,
    features: ['Unlimited AI report simplifier', 'Family accounts', 'Priority booking', 'Calendar sync'],
    limits: { familyMembers: 6, storageGb: 25, aiSimplifications: null },
  },
  {
    name: 'Enterprise',
    tier: PlanTier.ENTERPRISE,
    priceMonthly: 0,
    features: ['Employer / group health programmes', 'Admin dashboards', 'Dedicated support'],
    limits: { familyMembers: null, storageGb: null, aiSimplifications: null },
  },
];

@Injectable()
export class AdminSubscriptionsService {
  constructor(
    @InjectModel(Plan.name) private readonly planModel: Model<PlanDocument>,
    @InjectModel(Subscription.name) private readonly subModel: Model<SubscriptionDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  async listPlans() {
    if ((await this.planModel.estimatedDocumentCount()) === 0) {
      await this.planModel.insertMany(DEFAULT_PLANS);
    }
    const [plans, counts] = await Promise.all([
      this.planModel.find().sort({ priceMonthly: 1 }).exec(),
      this.subModel.aggregate<{ _id: Types.ObjectId; n: number }>([
        { $match: { status: SubscriptionStatus.ACTIVE } },
        { $group: { _id: '$planId', n: { $sum: 1 } } },
      ]),
    ]);
    const countByPlan = new Map(counts.map((c) => [c._id.toString(), c.n]));
    return plans.map((p) => ({
      ...this.toPlan(p),
      subscribers: countByPlan.get(p.id) ?? 0,
    }));
  }

  async createPlan(dto: CreatePlanDto) {
    if (await this.planModel.exists({ tier: dto.tier })) {
      throw new ConflictException(`A ${dto.tier} plan already exists`);
    }
    return this.toPlan(await this.planModel.create(dto));
  }

  async updatePlan(id: string, dto: UpdatePlanDto) {
    const plan = await this.getPlanOrThrow(id);
    Object.assign(plan, dto);
    await plan.save();
    return this.toPlan(plan);
  }

  async listSubscriptions(query: QuerySubscriptionsDto) {
    const filter: Record<string, unknown> = {};
    if (query.status) filter.status = query.status;
    if (query.tier) {
      const plan = await this.planModel.findOne({ tier: query.tier });
      filter.planId = plan?._id ?? new Types.ObjectId();
    }
    const subs = await this.subModel.find(filter).sort({ createdAt: -1 }).limit(200).exec();
    const [users, plans] = await Promise.all([
      this.userModel.find({ _id: { $in: subs.map((s) => s.userId) } }).select('fullName email').exec(),
      this.planModel.find({ _id: { $in: subs.map((s) => s.planId) } }).exec(),
    ]);
    const userById = new Map(users.map((u) => [u.id, u]));
    const planById = new Map(plans.map((p) => [p.id, p]));
    return subs.map((s) => ({
      id: s.id,
      userId: s.userId.toString(),
      userName: userById.get(s.userId.toString())?.fullName ?? 'Unknown',
      userEmail: userById.get(s.userId.toString())?.email,
      planId: s.planId.toString(),
      planName: planById.get(s.planId.toString())?.name ?? 'Unknown',
      tier: planById.get(s.planId.toString())?.tier,
      status: s.status,
      startedAt: s.startedAt.toISOString(),
      renewsAt: s.renewsAt?.toISOString(),
      cancelledAt: s.cancelledAt?.toISOString(),
    }));
  }

  async assign(dto: AssignSubscriptionDto) {
    if (!Types.ObjectId.isValid(dto.userId) || !(await this.userModel.exists({ _id: dto.userId }))) {
      throw new NotFoundException('User not found');
    }
    const plan = await this.getPlanOrThrow(dto.planId);
    // One live subscription per user: retire any current one before assigning.
    await this.subModel.updateMany(
      { userId: dto.userId, status: SubscriptionStatus.ACTIVE },
      { $set: { status: SubscriptionStatus.CANCELLED, cancelledAt: new Date() } },
    );
    const now = new Date();
    const sub = await this.subModel.create({
      userId: dto.userId,
      planId: plan._id,
      startedAt: now,
      renewsAt: plan.priceMonthly > 0 ? new Date(now.getTime() + 30 * 86_400_000) : undefined,
    });
    return { id: sub.id, planName: plan.name, status: sub.status };
  }

  async setStatus(id: string, action: 'cancel' | 'reactivate') {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Subscription not found');
    const sub = await this.subModel.findById(id);
    if (!sub) throw new NotFoundException('Subscription not found');
    if (action === 'cancel') {
      sub.status = SubscriptionStatus.CANCELLED;
      sub.cancelledAt = new Date();
    } else {
      sub.status = SubscriptionStatus.ACTIVE;
      sub.cancelledAt = undefined;
    }
    await sub.save();
    return { id: sub.id, status: sub.status };
  }

  private async getPlanOrThrow(id: string) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Plan not found');
    const plan = await this.planModel.findById(id);
    if (!plan) throw new NotFoundException('Plan not found');
    return plan;
  }

  private toPlan(p: PlanDocument) {
    return {
      id: p.id,
      name: p.name,
      tier: p.tier,
      priceMonthly: p.priceMonthly,
      currency: p.currency,
      features: p.features,
      limits: p.limits,
      active: p.active,
    };
  }
}
