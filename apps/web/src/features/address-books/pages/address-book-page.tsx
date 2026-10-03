import { Share2Icon } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ErrorState } from '@/components/error-state';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useUrlState } from '@/hooks/use-url-state';
import { formatCount } from '@/lib/format';
import { useAddressBook, useTags } from '../api';
import { BookActions } from '../components/book-actions';
import { BookKindBadge } from '../components/book-kind-badge';
import { PeersTab } from '../components/peers-tab';
import { ShareEditorDialog } from '../components/share-editor-dialog';
import { TagsTab } from '../components/tags-tab';
import { bookViewSearchSchema } from '../schemas';

export function AddressBookPage() {
  const { guid = '' } = useParams();
  const navigate = useNavigate();
  const book = useAddressBook(guid);
  const tags = useTags(guid);
  const { state, update } = useUrlState(bookViewSearchSchema);
  const [sharing, setSharing] = useState(false);

  if (book.error)
    return (
      <ErrorState error={book.error} what="address book" onRetry={() => void book.refetch()} />
    );
  if (!book.data) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }
  const b = book.data;

  return (
    <>
      <PageHeader
        title={b.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <BookKindBadge kind={b.kind} />
            {b.kind === 'PERSONAL' ? (
              <span>Personal book of {b.ownerUsername ?? 'a deleted user'}</span>
            ) : (
              <span>
                Shared with {formatCount(b.shareCount)} {b.shareCount === 1 ? 'user' : 'users'}
                {b.ownerUsername ? ` · owned by ${b.ownerUsername}` : ''}
              </span>
            )}
            {b.note ? <span className="text-muted-foreground">· {b.note}</span> : null}
          </span>
        }
        actions={
          <>
            {b.kind === 'SHARED' ? (
              <Button variant="outline" onClick={() => setSharing(true)}>
                <Share2Icon aria-hidden /> Share
              </Button>
            ) : null}
            <BookActions
              book={b}
              onDeleted={() => void navigate('/address-books', { replace: true })}
            />
          </>
        }
      />
      <Tabs
        value={state.tab}
        onValueChange={(tab) => update({ tab, q: undefined, tag: undefined, tagMode: undefined })}
        className="gap-4"
      >
        <TabsList>
          <TabsTrigger value="peers">Peers ({formatCount(b.peerCount)})</TabsTrigger>
          <TabsTrigger value="tags">
            Tags{tags.data ? ` (${formatCount(tags.data.length)})` : ''}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="peers">
          <PeersTab book={b} tags={tags.data ?? []} state={state} update={update} />
        </TabsContent>
        <TabsContent value="tags">
          <TagsTab
            book={b}
            tags={tags.data}
            isLoading={tags.isPending}
            error={tags.error}
            onRetry={() => void tags.refetch()}
          />
        </TabsContent>
      </Tabs>
      <ShareEditorDialog book={sharing ? b : null} onClose={() => setSharing(false)} />
    </>
  );
}
