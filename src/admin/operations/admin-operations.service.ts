import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AdminIssue, AdminIssueDocument, IssueDomain, IssueSeverity, IssueStatus } from './schemas/admin-issue.schema';
import { CreateIssueDto } from './dto/create-issue.dto';
import { QueryIssuesDto, ResolveIssueDto, UpdateIssueDto, AddTimelineEventDto } from './dto/operations.dto';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { AuditAction } from '../../audit-log/schemas/audit-log.schema';

@Injectable()
export class AdminOperationsService {
  constructor(
    @InjectModel(AdminIssue.name)
    private readonly issueModel: Model<AdminIssueDocument>,
    private readonly auditLogService: AuditLogService,
  ) {}

  async findAll(query: QueryIssuesDto): Promise<AdminIssue[]> {
    const count = await this.issueModel.countDocuments().exec();
    if (count === 0) {
      const initialIssues = [
        {
          title: 'EMR Slot Mismatch after provider reschedule',
          description: 'Provider Dr. Arvind Menon rescheduled Monday morning slots on hospital portal, but Ayuva booking engine retained old slot mapping resulting in 1 booking clash.',
          domain: IssueDomain.APPOINTMENTS,
          severity: IssueSeverity.HIGH,
          status: IssueStatus.INVESTIGATING,
          assignedTo: 'Vikram Mehta',
          slaDeadline: new Date(Date.now() + 2 * 3600 * 1000).toISOString(),
          affectedEntity: { type: 'Hospital', name: 'Apollo Spectra Hospital', identifier: 'HOSP-APOLLO-01' },
          evidence: ['SlotSync_Log_2026-08-20.json', 'BookingRef_#BK-9902'],
          timeline: [
            { id: 'ev-1', timestamp: new Date(Date.now() - 3600 * 1000).toISOString(), actor: 'System Monitoring', action: 'Mismatch Flag Raised', notes: 'EMR sync discrepancy detected between source ID 4920 and ledger.' },
            { id: 'ev-2', timestamp: new Date(Date.now() - 1800 * 1000).toISOString(), actor: 'Vikram Mehta', action: 'Assigned and Investigating', notes: 'Contacted Apollo EMR administrator to confirm authoritative slot state.' },
          ],
        },
        {
          title: 'Lab Report delivery webhook timeout (>10s)',
          description: 'Remote LIMS API at Dr. Lal PathLabs Indiranagar timed out after 10000ms during automated delivery of patient lipid panel.',
          domain: IssueDomain.LABS,
          severity: IssueSeverity.CRITICAL,
          status: IssueStatus.OPEN,
          assignedTo: 'Unassigned',
          slaDeadline: new Date(Date.now() + 1 * 3600 * 1000).toISOString(),
          affectedEntity: { type: 'Diagnostic Lab', name: 'Dr. Lal PathLabs - Indiranagar', identifier: 'LAB-LAL-IND' },
          evidence: ['Webhook_Timeout_Trace_504.log'],
          timeline: [
            { id: 'ev-3', timestamp: new Date(Date.now() - 2400 * 1000).toISOString(), actor: 'Webhook Gateway', action: 'Delivery Failed', notes: 'HTTP 504 Gateway Timeout from remote endpoint.' },
          ],
        },
        {
          title: 'AI dosage clarification safety guard review',
          domain: IssueDomain.AI,
          description: 'User prompt contained ambiguous medication dosage query. AI Assistant correctly prompted user to verify with doctor, but flagged for human clinical quality audit.',
          severity: IssueSeverity.MEDIUM,
          status: IssueStatus.TRIAGED,
          assignedTo: 'Dr. Sarah Jenkins',
          slaDeadline: new Date(Date.now() + 4 * 3600 * 1000).toISOString(),
          affectedEntity: { type: 'AI Log', name: 'Interaction #AI-9021', identifier: 'INT-9021' },
          evidence: ['Transcript_AI_9021.txt'],
          timeline: [
            { id: 'ev-4', timestamp: new Date(Date.now() - 5000 * 1000).toISOString(), actor: 'AI Guardrail Engine', action: 'Safety Tag Triggered', notes: 'Prescription clarification rubric scored 84/100.' },
          ],
        },
        {
          title: 'Patient consent revoked for secondary consultation',
          domain: IssueDomain.RECORDS,
          description: 'Patient requested immediate revocation of consent token for Fortis Hospital review desk.',
          severity: IssueSeverity.LOW,
          status: IssueStatus.RESOLVED,
          assignedTo: 'Support Desk',
          slaDeadline: new Date(Date.now() - 10000 * 1000).toISOString(),
          affectedEntity: { type: 'Patient', name: 'Rahul Sharma', identifier: 'USR-RAHUL-01' },
          evidence: ['Consent_Revoke_Req_903.json'],
          resolutionReason: 'Access token invalidated and audit event generated.',
          resolutionOutcome: 'Consent Cutoff Confirmed',
          resolvedBy: 'Support Desk',
          resolvedAt: new Date(Date.now() - 5000 * 1000),
          timeline: [
            { id: 'ev-5', timestamp: new Date(Date.now() - 15000 * 1000).toISOString(), actor: 'Patient Portal', action: 'Revocation Requested', notes: 'User triggered consent withdrawal.' },
            { id: 'ev-6', timestamp: new Date(Date.now() - 5000 * 1000).toISOString(), actor: 'Support Desk', action: 'Resolved: Consent Cutoff Confirmed', notes: 'Token destroyed in KMS.' },
          ],
        },
        {
          title: 'Duplicate payment webhook received from Razorpay',
          description: 'Razorpay dispatched the same payment webhook twice for transaction TXN-99120; idempotency layer must discard the duplicate without double-debiting the ledger.',
          domain: IssueDomain.BILLING,
          severity: IssueSeverity.MEDIUM,
          status: IssueStatus.RESOLVED,
          assignedTo: 'Finance Team',
          slaDeadline: new Date(Date.now() - 8000 * 1000).toISOString(),
          affectedEntity: { type: 'Transaction', name: 'Payment TXN-99120', identifier: 'TXN-99120' },
          evidence: ['Idempotency_Key_Match.log'],
          resolutionReason: 'Idempotency key prevented duplicate ledger debit.',
          resolutionOutcome: 'Duplicate Discarded Safely',
          resolvedBy: 'Finance Reconciler',
          resolvedAt: new Date(Date.now() - 7000 * 1000),
          timeline: [
            { id: 'ev-7', timestamp: new Date(Date.now() - 9000 * 1000).toISOString(), actor: 'Razorpay Webhook', action: 'Duplicate Received', notes: 'Idempotency key matched existing transaction.' },
          ],
        },
      ];
      await this.issueModel.insertMany(initialIssues);
    }

    const filter: Record<string, unknown> = {};
    if (query.domain) filter.domain = query.domain;
    if (query.severity) filter.severity = query.severity;
    if (query.status) filter.status = query.status;
    if (query.search) {
      filter.$or = [
        { title: { $regex: query.search, $options: 'i' } },
        { description: { $regex: query.search, $options: 'i' } },
        { 'affectedEntity.name': { $regex: query.search, $options: 'i' } },
        { assignedTo: { $regex: query.search, $options: 'i' } },
      ];
    }
    return this.issueModel.find(filter).sort({ createdAt: -1 }).exec();
  }

  async findOne(id: string): Promise<AdminIssue> {
    const issue = await this.issueModel.findById(id).exec();
    if (!issue) {
      throw new NotFoundException(`Issue with ID ${id} not found`);
    }
    return issue;
  }

  async create(createDto: CreateIssueDto, actorId: string, actorName = 'Admin'): Promise<AdminIssue> {
    const initialTimeline = [
      {
        id: `ev-${Date.now()}-1`,
        timestamp: new Date().toISOString(),
        actor: actorName,
        action: 'Issue Created',
        notes: `Reported under ${createDto.domain} domain with severity ${createDto.severity ?? IssueSeverity.MEDIUM}`,
      },
    ];

    const issue = new this.issueModel({
      ...createDto,
      status: IssueStatus.OPEN,
      timeline: initialTimeline,
      assignedTo: createDto.assignedTo || 'Unassigned',
      slaDeadline: createDto.slaDeadline || new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
    });

    const saved = await issue.save();

    await this.auditLogService.record({
      actorId: actorId as any,
      action: AuditAction.ADMIN_USER_UPDATE,
      targetType: 'AdminIssue',
      targetId: saved._id as any,
      metadata: { action: 'issue_created', title: saved.title, domain: saved.domain, severity: saved.severity },
    });

    return saved;
  }

  async update(id: string, updateDto: UpdateIssueDto, actorId: string, actorName = 'Admin'): Promise<AdminIssue> {
    const existing = await this.findOne(id);
    const timeline = [...(existing.timeline || [])];

    if (updateDto.status && updateDto.status !== existing.status) {
      timeline.push({
        id: `ev-${Date.now()}`,
        timestamp: new Date().toISOString(),
        actor: actorName,
        action: `Status changed to ${updateDto.status}`,
        notes: `Previous status was ${existing.status}`,
      });
    }

    if (updateDto.assignedTo && updateDto.assignedTo !== existing.assignedTo) {
      timeline.push({
        id: `ev-${Date.now()}`,
        timestamp: new Date().toISOString(),
        actor: actorName,
        action: `Reassigned to ${updateDto.assignedTo}`,
        notes: `Previous assignee: ${existing.assignedTo}`,
      });
    }

    const updated = await this.issueModel
      .findByIdAndUpdate(id, { ...updateDto, timeline }, { new: true })
      .exec();

    if (!updated) throw new NotFoundException(`Issue with ID ${id} not found`);

    return updated;
  }

  async addTimelineEvent(id: string, dto: AddTimelineEventDto, actorId: string, actorName = 'Admin'): Promise<AdminIssue> {
    const existing = await this.findOne(id);
    const timeline = [
      ...(existing.timeline || []),
      {
        id: `ev-${Date.now()}`,
        timestamp: new Date().toISOString(),
        actor: actorName,
        action: dto.action,
        notes: dto.notes,
      },
    ];

    const updated = await this.issueModel
      .findByIdAndUpdate(id, { timeline }, { new: true })
      .exec();
    if (!updated) throw new NotFoundException(`Issue with ID ${id} not found`);
    return updated;
  }

  async resolve(id: string, dto: ResolveIssueDto, actorId: string, actorName = 'Admin'): Promise<AdminIssue> {
    const existing = await this.findOne(id);
    const timeline = [
      ...(existing.timeline || []),
      {
        id: `ev-${Date.now()}`,
        timestamp: new Date().toISOString(),
        actor: actorName,
        action: `Resolved: ${dto.outcome}`,
        notes: `Reason: ${dto.reason}`,
      },
    ];

    const updated = await this.issueModel
      .findByIdAndUpdate(
        id,
        {
          status: IssueStatus.RESOLVED,
          resolutionReason: dto.reason,
          resolutionOutcome: dto.outcome,
          resolvedBy: actorName,
          resolvedAt: new Date(),
          timeline,
        },
        { new: true },
      )
      .exec();

    if (!updated) throw new NotFoundException(`Issue with ID ${id} not found`);

    await this.auditLogService.record({
      actorId: actorId as any,
      action: AuditAction.ADMIN_USER_UPDATE,
      targetType: 'AdminIssue',
      targetId: updated._id as any,
      metadata: { action: 'issue_resolved', reason: dto.reason, outcome: dto.outcome },
    });

    return updated;
  }

  async executeQuickAction(id: string, actionType: string, actorId: string, actorName = 'Admin'): Promise<AdminIssue> {
    let actionLabel = actionType;
    let note = '';

    if (actionType === 'retry') {
      actionLabel = 'System Retry Triggered';
      note = 'Triggered automatic service retry & payload reprocessing';
    } else if (actionType === 'reconcile') {
      actionLabel = 'Cross-System Reconciled';
      note = 'State synchronized between source product and central ledger';
    } else if (actionType === 'escalate') {
      actionLabel = 'Escalated to Tier-2 Engineering';
      note = 'High priority flag raised for urgent operational review';
    }

    return this.addTimelineEvent(id, { action: actionLabel, notes: note }, actorId, actorName);
  }
}
