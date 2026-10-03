import { CheckIcon, ChevronsUpDownIcon } from 'lucide-react';
import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Spinner } from '@/components/ui/spinner';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { cn } from '@/lib/utils';
import { useUsers } from '../api';

export interface PickedUser {
  id: string;
  username: string;
}

const RESULTS = 20;

/** Searches users on the server (never loads them all) and picks one. */
export function UserPicker({
  value,
  onChange,
  placeholder = 'Select a user',
  exclude = [],
  id,
  allowClear = false,
  clearLabel = 'Any user',
  'aria-label': ariaLabel,
}: {
  value: PickedUser | undefined;
  onChange: (user: PickedUser | undefined) => void;
  placeholder?: string;
  exclude?: string[];
  id?: string;
  allowClear?: boolean;
  clearLabel?: string;
  /** Needed when no <label> points at the picker (a combobox takes no name from its content). */
  'aria-label'?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const listId = useId();
  const debounced = useDebouncedValue(search.trim(), 300);
  const users = useUsers(
    { search: debounced || undefined, pageSize: RESULTS, page: 1, sort: 'username:asc' },
    { enabled: open },
  );
  const options = (users.data?.data ?? []).filter((u) => !exclude.includes(u.id));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-label={ariaLabel}
          className={cn('w-full justify-between font-normal', !value && 'text-muted-foreground')}
        >
          <span className="truncate">{value ? value.username : placeholder}</span>
          <ChevronsUpDownIcon aria-hidden className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-56 p-0" align="start">
        {/* Filtering happens in the API: cmdk's own filter is off. */}
        <Command shouldFilter={false}>
          <CommandInput placeholder="Search users…" value={search} onValueChange={setSearch} />
          <CommandList id={listId}>
            {users.isFetching && !users.data ? (
              <div className="flex justify-center py-6">
                <Spinner />
              </div>
            ) : (
              <CommandEmpty>
                {users.error ? 'Could not load users.' : 'No users found.'}
              </CommandEmpty>
            )}
            <CommandGroup>
              {allowClear && value ? (
                <CommandItem
                  value="__clear__"
                  onSelect={() => {
                    onChange(undefined);
                    setOpen(false);
                  }}
                >
                  {clearLabel}
                </CommandItem>
              ) : null}
              {options.map((u) => (
                <CommandItem
                  key={u.id}
                  value={u.id}
                  onSelect={() => {
                    onChange({ id: u.id, username: u.username });
                    setOpen(false);
                  }}
                >
                  <span className="truncate">{u.username}</span>
                  {u.displayName ? (
                    <span className="truncate text-xs text-muted-foreground">{u.displayName}</span>
                  ) : null}
                  <CheckIcon
                    aria-hidden
                    className={cn('ml-auto', value?.id === u.id ? 'opacity-100' : 'opacity-0')}
                  />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
