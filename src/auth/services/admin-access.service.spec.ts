import { Types } from 'mongoose';
import { AdminAccessService } from './admin-access.service';

/** A directory entry as stored — status deliberately loose, as legacy data can be. */
const serviceWith = (entry: Record<string, unknown> | null) => {
  const adminUserModel = {
    findOne: () => ({ exec: () => Promise.resolve(entry) }),
  };
  const roleModel = {
    findById: () => ({
      lean: () => ({
        exec: () =>
          Promise.resolve({ name: 'Ops', permissions: ['users.view'] }),
      }),
    }),
  };
  return new AdminAccessService(adminUserModel as never, roleModel as never);
};

const user = { id: new Types.ObjectId().toString(), email: 'admin@ayuva.test' };
const entry = (status: unknown) => ({
  id: 'a1',
  status,
  role: new Types.ObjectId(),
  permissions: [],
});

describe('AdminAccessService.resolve', () => {
  it('gives a login without a directory entry full access', async () => {
    const access = await serviceWith(null).resolve(user);
    expect(access).toMatchObject({ active: true, roleName: 'Super Admin' });
  });

  it.each(['ACTIVE', 'active', 'Active', undefined])(
    'treats status %s as active',
    async (status) => {
      expect((await serviceWith(entry(status)).resolve(user)).active).toBe(
        true,
      );
    },
  );

  it.each(['INACTIVE', 'inactive', 'SUSPENDED', 'suspended'])(
    'locks out status %s',
    async (status) => {
      expect((await serviceWith(entry(status)).resolve(user)).active).toBe(
        false,
      );
    },
  );
});
