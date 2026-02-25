/**
 * Embed page: /embed/:username
 * Renders the booking wizard in an iframe context (no page chrome).
 * Communicates with the host page via postMessage.
 *
 * postMessage events emitted:
 *   booking:loaded   { height: number }
 *   booking:resize   { height: number }
 *   booking:complete { bookingToken?: string, guestName: string, startsAt: string }
 *   booking:close
 *   booking:error    { message: string }
 */
import { useEffect, useRef, useCallback } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import BookingWizard from '@/components/booking/BookingWizard';
import { HEX_COLOR_REGEX } from '@/lib/constants';

export default function EmbedPage() {
  const { username } = useParams<{ username: string }>();
  const [searchParams] = useSearchParams();

  // Query params
  const accentRaw = searchParams.get('accent');
  const sessionParam = searchParams.get('session') ?? undefined;
  const parentOrigin = searchParams.get('parentOrigin') ?? null;

  // Validate accent color
  const accentColor =
    accentRaw && HEX_COLOR_REGEX.test(accentRaw) ? accentRaw : undefined;

  // Determine the postMessage target origin
  const targetOrigin = parentOrigin ?? '*';

  const wrapperRef = useRef<HTMLDivElement>(null);

  // Helper: send a postMessage to the parent frame
  const postToParent = useCallback(
    (type: string, payload?: Record<string, unknown>) => {
      try {
        window.parent.postMessage({ type, ...payload }, targetOrigin);
      } catch {
        // If targetOrigin is invalid, fall back to '*'
        try {
          window.parent.postMessage({ type, ...payload }, '*');
        } catch {
          // ignore
        }
      }
    },
    [targetOrigin]
  );

  // Emit booking:loaded on mount + set up ResizeObserver
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    // Emit initial loaded event
    const initialHeight = wrapper.scrollHeight;
    postToParent('booking:loaded', { height: initialHeight });

    // ResizeObserver for subsequent height changes
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const height = Math.ceil(entry.contentRect.height);
        postToParent('booking:resize', { height });
      }
    });

    ro.observe(wrapper);
    return () => ro.disconnect();
  }, [postToParent]);

  // ── Callbacks passed to BookingWizard ─────────────────────────────────────

  const handleComplete = useCallback(
    (data: { bookingToken: string; guestName: string; startsAt: string }) => {
      const payload: Record<string, unknown> = {
        guestName: data.guestName,
        startsAt: data.startsAt,
      };
      // Only include bookingToken when parentOrigin is known (security)
      if (parentOrigin) {
        payload.bookingToken = data.bookingToken;
      }
      postToParent('booking:complete', payload);
    },
    [parentOrigin, postToParent]
  );

  const handleClose = useCallback(() => {
    postToParent('booking:close');
  }, [postToParent]);

  const handleError = useCallback(
    (message: string) => {
      postToParent('booking:error', { message });
    },
    [postToParent]
  );

  if (!username) {
    return (
      <EmbedShell>
        <div className="p-6 text-center text-gray-500 text-sm">
          No practitioner specified.
        </div>
      </EmbedShell>
    );
  }

  return (
    <EmbedShell wrapperRef={wrapperRef}>
      <BookingWizard
        username={username}
        embed={true}
        accentColor={accentColor}
        preSelectedSessionTypeId={sessionParam}
        onComplete={handleComplete}
        onClose={handleClose}
        onError={handleError}
      />
    </EmbedShell>
  );
}

// ─── Shell ────────────────────────────────────────────────────────────────────

function EmbedShell({
  children,
  wrapperRef,
}: {
  children: React.ReactNode;
  wrapperRef?: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div
      ref={wrapperRef}
      className="bg-white min-h-0 w-full"
      style={{ padding: '16px' }}
    >
      {children}
    </div>
  );
}
