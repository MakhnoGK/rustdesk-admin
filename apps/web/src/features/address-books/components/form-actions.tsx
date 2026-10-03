import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

export function FormActions({
  pending,
  label,
  onCancel,
}: {
  pending: boolean;
  label: string;
  onCancel: () => void;
}) {
  return (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
        Cancel
      </Button>
      <Button type="submit" disabled={pending}>
        {pending ? <Spinner /> : null}
        {label}
      </Button>
    </div>
  );
}
