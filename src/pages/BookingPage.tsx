/**
 * Public booking page: /book/:username
 * Wraps BookingWizard in the full-page shell (bg, centering, padding).
 */
import { useParams, useSearchParams } from 'react-router-dom';
import BookingWizard from '@/components/booking/BookingWizard';
import { EmptyState } from '@/components/shared/EmptyState';

export default function BookingPage() {
  const { username } = useParams<{ username: string }>();
  const [searchParams] = useSearchParams();
  const sessionParam = searchParams.get('session') ?? undefined;

  if (!username) {
    return (
      <PageShell>
        <EmptyState title="Invalid booking link" description="No practitioner specified." />
      </PageShell>
    );
  }

  return (
    <PageShell>
      <BookingWizard username={username} preSelectedSessionTypeId={sessionParam} />
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
