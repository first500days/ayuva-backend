import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { AuditAction } from '../../audit-log/schemas/audit-log.schema';
import { User, UserDocument } from '../../core/users/schemas/user.schema';
import { PartnerActor } from '../rbac/partner-perm.guard';
import { dateStart, dayKey } from '../hospital/clock';
import {
  LabOrderDocument,
  LabOrderStatus,
  PartnerLabOrder,
} from './schemas/lab-order.schema';
import { PartnerLabOrdersService } from './partner-lab-orders.service';
import {
  LatLng,
  mapsLinks,
  orderStops,
  parseLocation,
  scheduleLegs,
} from './route-plan';
import {
  PlanRouteDto,
  SetVisitPinDto,
  SetVisitStatusDto,
} from './dto/lab-routes.dto';

const VISIT_LABEL: Record<string, string> = {
  en_route: 'on the way',
  arrived: 'arrived',
  collected: 'sample collected',
  not_home: 'patient not available',
};

/**
 * Home-collection logistics: the day's visits per field collector, a
 * planned order with estimated arrivals, Google Maps directions, and
 * pickup status from the collector.
 */
@Injectable()
export class PartnerLabRoutesService {
  constructor(
    @InjectModel(PartnerLabOrder.name)
    private readonly orderModel: Model<LabOrderDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    private readonly orders: PartnerLabOrdersService,
    private readonly audit: AuditLogService,
  ) {}

  async day(actor: PartnerActor, date?: string) {
    const ymd = date ?? dayKey(new Date());
    const start = dateStart(ymd);
    const end = new Date(start.getTime() + 86_400_000);
    const providerId = actor.provider._id;
    const [visits, unscheduled, collectors] = await Promise.all([
      this.orderModel
        .find({
          providerId,
          'sampleCollection.type': 'home',
          status: { $ne: LabOrderStatus.CANCELLED },
          'sampleCollection.scheduledAt': { $gte: start, $lt: end },
        })
        .exec(),
      this.orderModel
        .find({
          providerId,
          'sampleCollection.type': 'home',
          status: LabOrderStatus.ORDERED,
          'sampleCollection.scheduledAt': { $exists: false },
        })
        .sort({ createdAt: 1 })
        .limit(50)
        .exec(),
      this.orders.collectors(actor),
    ]);
    const phones = await this.phones([...visits, ...unscheduled]);
    const lab = this.origin(actor);
    const view = (o: LabOrderDocument) => this.visitView(o, phones);

    const byCollector = new Map<string, LabOrderDocument[]>();
    for (const o of visits) {
      const k = o.collectorMemberId?.toString() ?? '';
      byCollector.set(k, [...(byCollector.get(k) ?? []), o]);
    }
    return {
      date: ymd,
      lab: { name: actor.provider.name, address: lab.address, pin: lab.pin },
      collectors: collectors.map((c) => {
        const list = byCollector.get(c.id) ?? [];
        // The saved plan while it covers every visit; otherwise booked order
        // (a visit added or re-addressed since planning drops out of the plan).
        const planned =
          list.length > 0 && list.every((o) => o.sampleCollection.routeSeq);
        const booked = (o: LabOrderDocument) =>
          o.sampleCollection.scheduledAt?.getTime() ?? Infinity;
        const mine = [...list].sort((a, b) =>
          planned
            ? a.sampleCollection.routeSeq! - b.sampleCollection.routeSeq!
            : booked(a) - booked(b) ||
              (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0),
        );
        const stops = mine.map((o) => this.stop(o));
        const firstBooked = Math.min(
          ...stops.map((s) => s.scheduledAt?.getTime() ?? Infinity),
        );
        const departAt = new Date(
          Number.isFinite(firstBooked)
            ? firstBooked - 30 * 60_000
            : start.getTime() + 8 * 3_600_000,
        );
        const { legs, totalKm } = scheduleLegs(lab.pin, stops, departAt);
        return {
          ...c,
          planned,
          totalKm,
          mapsLinks: mine.length
            ? mapsLinks(
                lab.pin ? `${lab.pin.lat},${lab.pin.lng}` : lab.address,
                mine.map((o) => ({
                  pin: this.pinOf(o),
                  address: o.sampleCollection.address ?? '',
                })),
              )
            : [],
          visits: mine.map((o, i) => ({
            ...view(o),
            km: legs[i].km,
            etaAt: legs[i].etaAt.toISOString(),
            late: legs[i].late,
          })),
        };
      }),
      unassigned: (byCollector.get('') ?? []).map(view),
      unscheduled: unscheduled.map(view),
    };
  }

  /** Orders one collector's visits for the day (booked hour, then nearest next) and saves it. */
  async plan(actor: PartnerActor, dto: PlanRouteDto) {
    const start = dateStart(dto.date);
    const visits = await this.orderModel
      .find({
        providerId: actor.provider._id,
        collectorMemberId: new Types.ObjectId(dto.collectorMemberId),
        'sampleCollection.type': 'home',
        status: { $ne: LabOrderStatus.CANCELLED },
        'sampleCollection.scheduledAt': {
          $gte: start,
          $lt: new Date(start.getTime() + 86_400_000),
        },
      })
      .sort({ 'sampleCollection.scheduledAt': 1, createdAt: 1 })
      .exec();
    if (!visits.length)
      throw new BadRequestException(
        'No home visits for this collector on that day',
      );
    const ordered = orderStops(
      this.origin(actor).pin,
      visits.map((o) => this.stop(o)),
    );
    for (const [i, s] of ordered.entries()) {
      const o = visits.find((v) => v.id === s.id)!;
      o.sampleCollection.routeSeq = i + 1;
      o.markModified('sampleCollection');
      await o.save();
    }
    await this.audit.record({
      actorId: actor.userId,
      action: AuditAction.PARTNER_LAB_ORDER_UPDATE,
      targetType: 'PartnerMember',
      targetId: dto.collectorMemberId,
      metadata: {
        providerId: actor.provider.id,
        label: `Home-collection route planned for ${dto.date}: ${ordered.length} visit${ordered.length === 1 ? '' : 's'}`,
      },
      ipAddress: actor.ip,
    });
    return this.day(actor, dto.date);
  }

  /** The collector's pickup status at a visit. */
  async setVisit(actor: PartnerActor, orderId: string, dto: SetVisitStatusDto) {
    const order = await this.homeVisit(actor, orderId);
    const note = dto.note?.trim();
    if (dto.status === 'not_home' && (!note || note.length < 3))
      throw new BadRequestException(
        'Say what happened (e.g. no answer, rescheduled to 5 pm)',
      );
    if (
      order.status === LabOrderStatus.DELIVERED ||
      order.status === LabOrderStatus.CANCELLED
    )
      throw new BadRequestException('This order is closed');
    const now = new Date();
    order.sampleCollection.visitStatus = dto.status;
    order.sampleCollection.visitEvents = [
      ...(order.sampleCollection.visitEvents ?? []),
      {
        at: now,
        status: dto.status,
        byName: actor.member.fullName,
        ...(note && { note }),
      },
    ];
    order.markModified('sampleCollection');
    if (dto.status === 'collected')
      this.orders.collectFromVisit(actor, order, now);
    if (dto.status === 'not_home')
      order.statusHistory.push({
        at: now,
        status: order.status,
        byName: actor.member.fullName,
        note: `Home visit: patient not available — ${note}`,
      });
    await order.save();
    await this.audit.record({
      actorId: actor.userId,
      action: AuditAction.PARTNER_LAB_ORDER_UPDATE,
      targetType: 'PartnerLabOrder',
      targetId: order.id,
      metadata: {
        providerId: actor.provider.id,
        patientId: order.patientId.toString(),
        label: `${order.orderNo} · home visit: ${VISIT_LABEL[dto.status]}${note ? ` — ${note}` : ''}`,
      },
      ipAddress: actor.ip,
    });
    const phones = await this.phones([order]);
    return this.visitView(order, phones);
  }

  /** Pins a visit from coordinates or a Google Maps link. */
  async setPin(actor: PartnerActor, orderId: string, dto: SetVisitPinDto) {
    const order = await this.homeVisit(actor, orderId);
    const pin = parseLocation(dto.location);
    if (!pin)
      throw new BadRequestException(
        'Paste coordinates (12.9716, 77.5946) or a Google Maps link to the place',
      );
    order.sampleCollection.lat = pin.lat;
    order.sampleCollection.lng = pin.lng;
    order.markModified('sampleCollection');
    await order.save();
    return this.visitView(order, await this.phones([order]));
  }

  private async homeVisit(actor: PartnerActor, orderId: string) {
    const order = await this.orders.load(actor, orderId);
    if (order.sampleCollection?.type !== 'home')
      throw new NotFoundException('This order isn’t a home collection');
    return order;
  }

  private origin(actor: PartnerActor): { address: string; pin: LatLng | null } {
    const locs = actor.provider.locations ?? [];
    const pinned = locs.find(
      (l) => typeof l.lat === 'number' && typeof l.lng === 'number',
    );
    const l = pinned ?? locs[0];
    return {
      address: l?.address ?? actor.provider.name,
      pin: pinned ? { lat: pinned.lat!, lng: pinned.lng! } : null,
    };
  }

  private pinOf(o: LabOrderDocument): LatLng | null {
    const c = o.sampleCollection;
    return typeof c?.lat === 'number' && typeof c?.lng === 'number'
      ? { lat: c.lat, lng: c.lng }
      : null;
  }

  private stop(o: LabOrderDocument) {
    const pin = this.pinOf(o);
    return {
      id: o.id,
      lat: pin?.lat ?? null,
      lng: pin?.lng ?? null,
      scheduledAt: o.sampleCollection.scheduledAt ?? null,
    };
  }

  private async phones(orders: LabOrderDocument[]) {
    const users = await this.userModel
      .find({ _id: { $in: orders.map((o) => o.patientId) } })
      .select('phone')
      .lean()
      .exec();
    return new Map(users.map((u) => [u._id.toString(), u.phone ?? null]));
  }

  private visitView(o: LabOrderDocument, phones: Map<string, string | null>) {
    const c = o.sampleCollection;
    const last = c.visitEvents?.[c.visitEvents.length - 1];
    return {
      orderId: o.id,
      orderNo: o.orderNo,
      patientName: o.patientName,
      patientPhone: phones.get(o.patientId.toString()) ?? null,
      address: c.address ?? null,
      pin: this.pinOf(o),
      scheduledAt: c.scheduledAt?.toISOString() ?? null,
      orderStatus: o.status,
      visitStatus: c.visitStatus ?? 'planned',
      visitNote: last?.note ?? null,
      visitAt: last?.at.toISOString() ?? null,
      routeSeq: c.routeSeq ?? null,
      collectorMemberId: o.collectorMemberId?.toString() ?? null,
      collectorName: o.collectorName ?? null,
      tests: o.items.map((i) => i.name),
      sampleTypes: [
        ...new Set(o.items.map((i) => i.sampleType).filter(Boolean)),
      ] as string[],
    };
  }
}
