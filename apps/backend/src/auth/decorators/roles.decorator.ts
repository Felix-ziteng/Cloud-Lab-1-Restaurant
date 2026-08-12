import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

// 用法：@Roles('manager') —— 仅 role = manager 的店员账号可访问（对应改价/打折/作废/菜单管理等敏感操作）
export const Roles = (...roles: Array<'staff' | 'manager'>) => SetMetadata(ROLES_KEY, roles);
