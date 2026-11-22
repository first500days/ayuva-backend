import { Types } from 'mongoose';
import { AdminAdminUsersService } from './admin-admin-users.service';
import { AdminUserStatus } from '../../core/admin-users/schemas/admin-user.schema';

// Mongoose-style query chain: .select() / .lean() / .exec() all lead to `value`.
const chain = (value: unknown): Record<string, unknown> => ({
  select: () => chain(value),
  lean: () => chain(value),
  exec: () => Promise.resolve(value),
});

const superRole = { _id: new Types.ObjectId(), permissions: ['*'] };
const viewerRole = { _id: new Types.ObjectId(), permissions: ['users.view'] };

const entry = (
  role: { _id: Types.ObjectId },
  status: string = AdminUserStatus.ACTIVE,
) => ({
  _id: new Types.ObjectId(),
  userId: new Types.ObjectId(),
  email: `${new Types.ObjectId().toString()}@ayuva.test`,
  role: role._id,
  permissions: [] as string[],
  status,
});

function setup(
  target: ReturnType<typeof entry>,
  others: ReturnType<typeof entry>[],
  unlisted = 0,
) {
  const doc = {
    ...target,
    id: target._id.toString(),
    save: jest.fn().mockResolvedValue(undefined),
  };
  const adminUserModel = {
    findById: () => chain(doc),
    find: () => chain([target, ...others]),
  };
  const userModel = {
    findOne: () => chain(null),
    countDocuments: () => chain(unlisted),
    updateOne: () => Promise.resolve({}),
    find: () => chain([]),
  };
  const roleModel = { find: () => chain([superRole, viewerRole]) };
  const service = new AdminAdminUsersService(
    adminUserModel as never,
    userModel as never,
    roleModel as never,
    { record: jest.fn() } as never,
  );
  return { service, doc };
}

const actor = new Types.ObjectId().toString();

describe('AdminAdminUsersService — lockout guard', () => {
  it('refuses to let an admin deactivate themselves', async () => {
    const me = entry(superRole);
    const { service } = setup(me, [entry(superRole)]);
    await expect(
      service.deactivate(me._id.toString(), me.userId.toString()),
    ).rejects.toThrow(/your own admin access/);
  });

  it('refuses to deactivate the last active full-access admin', async () => {
    const last = entry(superRole);
    const { service, doc } = setup(last, [
      entry(viewerRole),
      entry(superRole, 'INACTIVE'),
    ]);
    await expect(
      service.deactivate(last._id.toString(), actor),
    ).rejects.toThrow(/last active admin/);
    expect(doc.save).not.toHaveBeenCalled();
  });

  it('refuses suspending the last one through an edit too', async () => {
    const last = entry(superRole);
    const { service } = setup(last, []);
    await expect(
      service.update(
        last._id.toString(),
        { status: AdminUserStatus.SUSPENDED },
        actor,
      ),
    ).rejects.toThrow(/last active admin/);
  });

  it('allows it while another full-access admin is active, even stored as "active"', async () => {
    const target = entry(superRole);
    const { service, doc } = setup(target, [entry(superRole, 'active')]);
    await service.deactivate(target._id.toString(), actor);
    expect(doc.save).toHaveBeenCalled();
    expect(doc.status).toBe(AdminUserStatus.INACTIVE);
  });

  it('counts admin logins without a directory entry as full access', async () => {
    const target = entry(superRole);
    const { service, doc } = setup(target, [], 1);
    await service.deactivate(target._id.toString(), actor);
    expect(doc.save).toHaveBeenCalled();
  });

  it('lets a limited admin be deactivated without another Super Admin', async () => {
    const viewer = entry(viewerRole);
    const { service, doc } = setup(viewer, []);
    await service.deactivate(viewer._id.toString(), actor);
    expect(doc.save).toHaveBeenCalled();
  });
});
