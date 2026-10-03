import { CheckIcon, ChevronsUpDownIcon } from 'lucide-react';
import { useId, useState } from 'react';
import type { Tag } from '@/api/types';
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
import { cn } from '@/lib/utils';
import { TagChip, TagColorDot } from './tag-chip';

/** Command + Popover multi-select over a book's tags, with colored chips for the selection. */
export function TagMultiSelect({
  tags,
  value,
  onChange,
  id,
  invalid,
  disabled,
}: {
  tags: Tag[];
  value: string[];
  onChange: (value: string[]) => void;
  id?: string;
  invalid?: boolean;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const colorOf = (name: string) => tags.find((t) => t.name === name)?.color;
  const toggle = (name: string) =>
    onChange(value.includes(name) ? value.filter((v) => v !== name) : [...value, name]);

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-invalid={invalid}
            disabled={disabled}
            className="w-full justify-between font-normal"
          >
            {value.length ? `${value.length} selected` : 'Select tags'}
            <ChevronsUpDownIcon aria-hidden className="opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
          <Command>
            <CommandInput placeholder="Search tags…" />
            <CommandList id={listId}>
              <CommandEmpty>No tags in this address book.</CommandEmpty>
              <CommandGroup>
                {tags.map((tag) => {
                  const selected = value.includes(tag.name);
                  return (
                    <CommandItem
                      key={tag.name}
                      value={tag.name}
                      onSelect={() => toggle(tag.name)}
                      aria-selected={selected}
                    >
                      <TagColorDot color={tag.color} />
                      <span className="truncate">{tag.name}</span>
                      <CheckIcon
                        aria-hidden
                        className={cn('ml-auto', selected ? 'opacity-100' : 'opacity-0')}
                      />
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {value.length ? (
        <ul className="flex flex-wrap gap-1.5" aria-label="Selected tags">
          {value.map((name) => (
            <li key={name}>
              <TagChip name={name} color={colorOf(name)} onRemove={() => toggle(name)} />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
