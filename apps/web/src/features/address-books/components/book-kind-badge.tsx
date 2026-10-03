import type { AddressBookKind } from '@/api/types';
import { Badge } from '@/components/ui/badge';

export function BookKindBadge({ kind }: { kind: AddressBookKind }) {
  return kind === 'SHARED' ? <Badge>Shared</Badge> : <Badge variant="secondary">Personal</Badge>;
}
