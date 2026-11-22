# Provider onboarding: integrations and commercial terms

This guide is the working checklist for onboarding a clinic, hospital, or
diagnostic centre. It is a negotiation aid, not a signed contract or a promise
of a particular commercial rate.

## Provider APIs

### Current implementation

The partner portal and patient/admin workflows use Ayuva's backend API and
shared provider, appointment, lab, and billing records. The Admin
**Integrations & APIs** screen currently represents platform-level connector
telemetry; it is not a per-provider API configuration screen. Its seeded
connector metrics and manual “Test Ping” action do not establish that a real
provider system is connected or synchronized.

No provider-specific vendor API should be considered live until a sandbox
connection, data mapping, and end-to-end reconciliation have been verified.

### Integration approach

Keep the portal and core workflows independent of each provider's vendor:

1. Agree the systems and workflows in scope with the provider (for example,
   appointment availability, bookings, lab orders/results, or billing).
2. Select an adapter for the provider's interface: FHIR, HL7, a documented
   REST API, or a separately scoped custom integration. These are choices,
   not assumptions that every provider supports them.
3. Map vendor records into Ayuva's canonical provider, slot, appointment, lab,
   and payment records. Keep vendor IDs alongside Ayuva IDs for reconciliation.
4. Make writes idempotent; validate webhook signatures; retry transient
   failures with bounded backoff; surface permanent failures for operations
   review. Reconcile status and totals rather than treating an HTTP 200 as proof
   that the workflows agree.
5. Store credentials in a managed secret store, scoped to the provider and
   environment. Never put credentials in the browser, source control, or
   webhook payload logs. Minimize and audit any patient-data transfer.
6. Test against the provider's sandbox with agreed success, failure, duplicate,
   timeout, cancellation, and reconciliation cases before production cutover.

### Provider technical discovery checklist

- Provider organization, locations, and technical contact
- Vendor/product name, version, environment, and API documentation
- Supported standards, endpoints, resources, and event/webhook behavior
- Authentication, certificate/network requirements, credential owner, and
  rotation procedure
- Which system is authoritative for availability, booking status, results, and
  payment status
- Required fields, identifiers, terminology/code systems, time zone, and
  status mappings
- Sandbox access, test data, rate limits, maintenance window, and vendor fees
- Data-sharing/security review, retention expectations, audit needs, and
  incident contacts
- Acceptance criteria, monitoring owner, support hours, and rollback plan

## Commercial discussion sheet

### Draft opening offer

> Ayuva can provide your organization with a verified provider listing and
> patient discovery, appointment booking and referral workflows, and a partner
> workspace for appointments, staff, and relevant billing or lab operations.
> Your organization retains control of its availability, services, and
> appointment acceptance. We will agree the commercial model, settlement,
> integration scope, support expectations, and data responsibilities with you
> before activation; no rate or external-system compatibility is assumed in
> this discussion draft.

Use the discussion sheet below to tailor that offer to the provider's size,
service mix, operational needs, and technical readiness. A pilot, pricing
model, or exclusivity term must be explicitly agreed rather than presumed.

Complete this sheet with the provider. Keep all amounts and percentages blank
until both sides negotiate them; do not infer a rate from the portal's
consultation fee or patient subscription plans.

| Topic | Proposed term | Provider response | Agreed term |
|---|---|---|---|
| Provider organization and locations |  |  |  |
| Services / specialties / test catalogue |  |  |  |
| Ayuva value offered (discovery, booking, workflow tools, reporting, etc.) |  |  |  |
| Commercial model (subscription, per completed booking, revenue share, fixed fee, hybrid, other) |  |  |  |
| Fee / percentage / currency / tax treatment |  |  |  |
| What event earns a fee (booking, completed visit, settled claim, etc.) |  |  |  |
| Refunds, cancellations, no-shows, disputes, and reversals |  |  |  |
| Settlement frequency, minimums, reconciliation, and payout owner |  |  |  |
| Pilot scope, duration, success measures, and exit decision |  |  |  |
| Integration scope, implementation cost, and ongoing support |  |  |  |
| Service hours, response targets, escalation, and downtime handling |  |  |  |
| Data access, permitted use, retention, and security responsibilities |  |  |  |
| Term, renewal, notice period, exclusivity (if any), and termination |  |  |  |
| Open issues, owner, due date, and next meeting |  |  |  |

### Before activation

- Commercial and operational terms have named owners and written approval.
- Provider identity, licences, locations, fees, and service details are
  verified.
- Any API integration has passed the agreed sandbox and reconciliation tests.
- Staff have been trained on appointments, patient records access, billing,
  refunds/voids, and escalation.
- Admin verification and production activation are completed separately from
  commercial negotiation.
