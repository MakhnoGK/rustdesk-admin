import type { UserRole, UserStatus } from '@/api/types';
import { Badge } from '@/components/ui/badge';

export function RoleBadge({ role }: { role: UserRole }) {
  return role === 'ADMIN' ? <Badge>Administrator</Badge> : <Badge variant="secondary">User</Badge>;
}

export function UserStatusBadge({ status }: { status: UserStatus }) {
  return status === 'ACTIVE' ? (
    <Badge
      variant="outline"
      className="border-status-active/30 bg-status-active/12 text-status-active"
    >
      Active
    </Badge>
  ) : (
    <Badge variant="outline" className="text-muted-foreground">
      Disabled
    </Badge>
  );
}
