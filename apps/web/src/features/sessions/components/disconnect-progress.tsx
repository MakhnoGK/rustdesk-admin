import { DisconnectState } from '@/components/disconnect-state';
import { useDisconnectProgress } from '../api';

/** Live state of a remote disconnect (polls until closed or expired). */
export function DisconnectProgress({
  sessionId,
  showDescription,
}: {
  sessionId: string;
  showDescription?: boolean;
}) {
  const { phase } = useDisconnectProgress(sessionId);
  return <DisconnectState phase={phase} showDescription={showDescription} />;
}
