/**
 * Admin Panel modules (one per sidebar entry) and the permission resources
 * that open each one. A permission like "payments:refund" grants every module
 * listing "payments"; "*" grants everything. GET /admin/me hands the allowed
 * modules to the admin frontend, which renders its sidebar from them, and the
 * same table guards the API — so the screen and the server never disagree.
 */
export const ADMIN_MODULE_RESOURCES = {
  // The Command Center is every admin's landing page.
  dashboard: [],
  operations: ['operations'],
  users: ['users'],
  appointments: ['appointments', 'providers'],
  hospitals: ['hospitals'],
  labs: ['labs'],
  'lab-deliveries': ['labs'],
  diagnostics: ['labs'],
  providers: ['providers'],
  verification: ['providers', 'hospitals', 'labs'],
  marketplace: ['marketplace'],
  'ai-control': ['ai'],
  'ai-monitoring': ['ai'],
  records: ['records'],
  reports: ['reports', 'records'],
  feedback: ['feedback'],
  content: ['content'],
  payments: ['payments', 'invoices', 'finance'],
  subscriptions: ['payments', 'finance'],
  growth: ['growth'],
  founder: ['founder'],
  'admin-users': ['admin_users'],
  roles: ['roles'],
  integrations: ['integrations'],
  'audit-explorer': ['audit'],
  settings: ['settings'],
} as const satisfies Record<string, readonly string[]>;

export type AdminModuleKey = keyof typeof ADMIN_MODULE_RESOURCES;

export const ALL_ADMIN_MODULES = Object.keys(ADMIN_MODULE_RESOURCES) as AdminModuleKey[];

/** "payments:refund" → "payments". */
function resourceOf(permission: string): string {
  return permission.split(':')[0].trim().toLowerCase();
}

export function canUseAdminModule(permissions: readonly string[], module: AdminModuleKey): boolean {
  if (permissions.includes('*')) return true;
  const resources: readonly string[] = ADMIN_MODULE_RESOURCES[module];
  if (resources.length === 0) return true;
  return permissions.some((p) => resources.includes(resourceOf(p)));
}

export function allowedAdminModules(permissions: readonly string[]): AdminModuleKey[] {
  return ALL_ADMIN_MODULES.filter((m) => canUseAdminModule(permissions, m));
}
