import { useEffect, useState } from 'react';
import type { Announcement } from '@bugshop/protocol';
import { fetchAnnouncement, loadDismissed, saveDismissed } from '../online/announcement';

/** How often to look for a new message while the page stays open. */
const REFRESH_MS = 5 * 60_000;

/** Site-wide message from the maintainer, shown as plain text under the header. */
export function AnnouncementBanner() {
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [dismissed, setDismissed] = useState<number | null>(loadDismissed);

  useEffect(() => {
    let cancelled = false;
    const load = () => void fetchAnnouncement().then(a => !cancelled && setAnnouncement(a));
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (!announcement || announcement.updatedAt === dismissed) return null;

  return (
    <div className={`announcement ${announcement.level}`} role="status">
      {/* Text only: never rendered as HTML, and links are not made clickable. */}
      <p>{announcement.message}</p>
      <button
        type="button"
        className="announcement-close"
        aria-label="Dismiss this message"
        onClick={() => {
          saveDismissed(announcement.updatedAt);
          setDismissed(announcement.updatedAt);
        }}
      >
        ×
      </button>
    </div>
  );
}
