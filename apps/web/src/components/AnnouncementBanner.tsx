import { useEffect, useState } from 'react';
import type { Announcement } from '@bugshop/protocol';
import { fetchAnnouncement, loadDismissed, saveDismissed } from '../online/announcement';
import { HazardIcon, LanternIcon } from './icons';

/** How often to look for a new message while the page stays open. */
const REFRESH_MS = 5 * 60_000;

/**
 * Site-wide message from the maintainer: a wooden trail sign hanging under the
 * header, as wide as its text. Warnings are painted amber like a hazard marker.
 */
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
  const warning = announcement.level === 'warning';

  return (
    <div className="announcement-wrap">
      {/* key: a new message swings in again */}
      <aside key={announcement.updatedAt} className={`trail-sign ${announcement.level}`} role="status">
        {warning ? <HazardIcon /> : <LanternIcon />}
        <div className="trail-sign-text">
          <span className="trail-sign-kicker">{warning ? 'Heads up' : 'Camp news'}</span>
          {/* Text only: never rendered as HTML, and links are not made clickable. */}
          <p>{announcement.message}</p>
        </div>
        <button
          type="button"
          className="trail-sign-close"
          aria-label="Dismiss this message"
          onClick={() => {
            saveDismissed(announcement.updatedAt);
            setDismissed(announcement.updatedAt);
          }}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
        </button>
      </aside>
    </div>
  );
}
