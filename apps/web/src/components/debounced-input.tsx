import { SearchIcon } from 'lucide-react';
import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { Input } from '@/components/ui/input';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';

export const DEBOUNCE_MS = 400;

type Props = Omit<ComponentProps<'input'>, 'value' | 'onChange'> & {
  value: string | undefined;
  /** Called after a pause in typing, with the trimmed value (`undefined` when empty). */
  onCommit: (value: string | undefined) => void;
  search?: boolean;
};

/** A text filter that reaches the URL only after the user stops typing. */
export function DebouncedInput({ value, onCommit, search = false, ...props }: Props) {
  const [draft, setDraft] = useState(value ?? '');
  const [synced, setSynced] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // The URL changed from elsewhere (back button, "clear filters"): follow it.
  if (value !== synced) {
    setSynced(value);
    setDraft(value ?? '');
  }

  useEffect(() => () => clearTimeout(timer.current), []);

  const onChange = (next: string) => {
    setDraft(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const committed = next.trim() || undefined;
      if (committed !== value) onCommit(committed);
    }, DEBOUNCE_MS);
  };

  if (search) {
    return (
      <InputGroup>
        <InputGroupAddon>
          <SearchIcon aria-hidden />
        </InputGroupAddon>
        <InputGroupInput {...props} value={draft} onChange={(e) => onChange(e.target.value)} />
      </InputGroup>
    );
  }
  return <Input {...props} value={draft} onChange={(e) => onChange(e.target.value)} />;
}
