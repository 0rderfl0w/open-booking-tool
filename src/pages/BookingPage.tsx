/**
 * Public booking page.
 * Handles three URL patterns:
 *   /book/:username/:sessionSlug  — direct two-param route
 *   /book/:slugOrUsername         — ambiguous: try username first, then session slug
 *
 * Slug-to-session resolution happens here; BookingWizard receives a
 * resolved preSelectedSessionTypeId (never a raw slug).
 */
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import BookingWizard from '@/components/booking/BookingWizard';
import { EmptyState } from '@/components/shared/EmptyState';
import { supabasePublic } from '@/lib/supabase';
import { nameToSlug } from '@/lib/utils';

type ResolvedState =
  | { status: 'loading' }
  | { status: 'wizard'; username: string; preSelectedSessionTypeId?: string }
  | { status: 'disambiguation'; links: { username: string; sessionSlug: string; name: string }[] }
  | { status: 'error'; title: string; description: string };

export default function BookingPage() {
  const { username, slugOrUsername, sessionSlug } = useParams<{
    username?: string;
    slugOrUsername?: string;
    sessionSlug?: string;
  }>();

  const [resolved, setResolved] = useState<ResolvedState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;

    async function resolve() {
      // ── Two-param route: /book/:username/:sessionSlug ──────────────────────
      if (username && sessionSlug) {
        const { data: practitioner } = await supabasePublic
          .from('practitioners')
          .select('id, username')
          .eq('username', username)
          .maybeSingle();

        if (!practitioner) {
          if (!cancelled) setResolved({ status: 'error', title: 'Practitioner not found', description: `No practitioner with username "${username}".` });
          return;
        }

        const { data: sessionTypes } = await supabasePublic
          .from('session_types')
          .select('id, name')
          .eq('practitioner_id', practitioner.id)
          .eq('is_active', true);

        const match = (sessionTypes ?? []).find(st => nameToSlug(st.name) === sessionSlug);

        if (!cancelled) {
          if (match) {
            setResolved({ status: 'wizard', username: practitioner.username, preSelectedSessionTypeId: match.id });
          } else {
            setResolved({ status: 'error', title: 'Session type not found', description: `No active session matching "${sessionSlug}" for this practitioner.` });
          }
        }
        return;
      }

      // ── Single-param route: /book/:slugOrUsername ──────────────────────────
      if (slugOrUsername) {
        // 1. Try as username first
        const { data: practitioner } = await supabasePublic
          .from('practitioners')
          .select('id, username')
          .eq('username', slugOrUsername)
          .maybeSingle();

        if (practitioner) {
          if (!cancelled) setResolved({ status: 'wizard', username: practitioner.username });
          return;
        }

        // 2. Try as session slug
        const { data: sessionTypes } = await supabasePublic
          .from('session_types')
          .select('id, name, practitioner_id, practitioners!inner(username)')
          .eq('is_active', true);

        const matches = (sessionTypes ?? []).filter(
          (st: any) => nameToSlug(st.name) === slugOrUsername
        );

        if (cancelled) return;

        if (matches.length === 0) {
          setResolved({ status: 'error', title: 'Not found', description: 'No practitioner or session type matches this link.' });
        } else if (matches.length === 1) {
          const st = matches[0] as any;
          const pUsername = Array.isArray(st.practitioners) ? st.practitioners[0]?.username : st.practitioners?.username;
          setResolved({ status: 'wizard', username: pUsername, preSelectedSessionTypeId: st.id });
        } else {
          // Multiple practitioners share the same session slug — show disambiguation
          const links = matches.map((st: any) => {
            const pUsername = Array.isArray(st.practitioners) ? st.practitioners[0]?.username : st.practitioners?.username;
            return { username: pUsername, sessionSlug: nameToSlug(st.name), name: st.name };
          });
          setResolved({ status: 'disambiguation', links });
        }
        return;
      }

      setResolved({ status: 'error', title: 'Invalid booking link', description: 'No practitioner specified.' });
    }

    resolve();
    return () => { cancelled = true; };
  }, [username, slugOrUsername, sessionSlug]);

  if (resolved.status === 'loading') {
    return (
      <PageShell>
        <div className="flex items-center justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-indigo-600" />
        </div>
      </PageShell>
    );
  }

  if (resolved.status === 'error') {
    return (
      <PageShell>
        <EmptyState title={resolved.title} description={resolved.description} />
      </PageShell>
    );
  }

  if (resolved.status === 'disambiguation') {
    return (
      <PageShell>
        <EmptyState
          title="Multiple practitioners offer this session"
          description="Please choose a practitioner:"
        />
        <ul className="mt-4 space-y-2 text-center">
          {resolved.links.map(link => (
            <li key={`${link.username}/${link.sessionSlug}`}>
              <a
                href={`/book/${link.username}/${link.sessionSlug}`}
                className="text-indigo-600 underline hover:text-indigo-800"
              >
                {link.username} — {link.name}
              </a>
            </li>
          ))}
        </ul>
      </PageShell>
    );
  }

  // resolved.status === 'wizard'
  return (
    <PageShell>
      <BookingWizard
        username={resolved.username}
        preSelectedSessionTypeId={resolved.preSelectedSessionTypeId}
      />
    </PageShell>
  );
}

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-lg mx-auto px-4 py-8 sm:py-12">
        {children}
      </div>
    </div>
  );
}
