export const STORE_MEMBER_ROLES = ['owner', 'admin', 'staff'] as const;

export type StoreMemberRole = typeof STORE_MEMBER_ROLES[number];
export type StoreRoleFilter = 'all' | StoreMemberRole;

export const isStoreMemberRole = (role: unknown): role is StoreMemberRole => (
  typeof role === 'string' && STORE_MEMBER_ROLES.includes(role as StoreMemberRole)
);

export const normalizeStoreMemberRole = (role: unknown): StoreMemberRole => (
  isStoreMemberRole(role) ? role : 'staff'
);

export const getStoreRoleLabel = (role: StoreMemberRole | null | undefined) => {
  switch (role) {
    case 'owner':
      return 'オーナー';
    case 'admin':
      return '管理者';
    case 'staff':
      return 'スタッフ';
    default:
      return '未設定';
  }
};

export const isStoreAdminRole = (role: StoreMemberRole | null | undefined) => (
  role === 'owner' || role === 'admin'
);
