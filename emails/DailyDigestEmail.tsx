import {
  Html,
  Head,
  Preview,
  Body,
  Container,
  Section,
  Text,
  Heading,
  Button,
  Hr,
} from '@react-email/components';
import { format } from 'date-fns';
import { utcToZonedTime } from 'date-fns-tz';
import type { Booking, SessionType, Practitioner } from '../src/types/database';
import { getAppUrl } from '../src/lib/constants';

interface DigestBooking extends Booking {
  sessionType: SessionType;
}

interface DailyDigestEmailProps {
  practitioner: Practitioner;
  bookings: DigestBooking[];
  date: string; // YYYY-MM-DD, the date the digest covers (tomorrow)
}

export function DailyDigestEmail({
  practitioner,
  bookings,
  date,
}: DailyDigestEmailProps) {
  const appUrl = getAppUrl();
  const count = bookings.length;
  const practitionerTimezone = practitioner.timezone || 'UTC';

  const formattedDate = format(new Date(date + 'T12:00:00'), 'EEEE, MMMM d, yyyy');

  return (
    <Html>
      <Head />
      <Preview>
        {`Your schedule for tomorrow — ${count} booking${count !== 1 ? 's' : ''}`}
      </Preview>
      <Body style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', backgroundColor: '#f8fafc' }}>
        <Container style={{ margin: '0 auto', padding: '40px 20px', maxWidth: '600px' }}>
          <Section style={{ backgroundColor: '#ffffff', borderRadius: '8px', padding: '32px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <Heading style={{ margin: '0 0 8px 0', fontSize: '24px', fontWeight: '600', color: '#1e293b' }}>
              Your schedule for tomorrow 📅
            </Heading>

            <Text style={{ margin: '0 0 24px 0', fontSize: '16px', color: '#475569' }}>
              Hi {practitioner.display_name}, you have{' '}
              <strong>{count} booking{count !== 1 ? 's' : ''}</strong> on{' '}
              <strong>{formattedDate}</strong>.
            </Text>

            {/* Booking List */}
            {bookings.map((booking) => {
              const zonedStart = utcToZonedTime(new Date(booking.starts_at), practitionerTimezone);
              const zonedEnd = utcToZonedTime(new Date(booking.ends_at), practitionerTimezone);
              const bookingUrl = `${appUrl}/booking/${booking.booking_token}`;

              return (
                <Section
                  key={booking.id}
                  style={{
                    backgroundColor: '#f8fafc',
                    borderRadius: '6px',
                    padding: '16px 20px',
                    marginBottom: '12px',
                    borderLeft: '3px solid #3b82f6',
                  }}
                >
                  <Text style={{ margin: '0 0 4px 0', fontSize: '16px', fontWeight: '600', color: '#1e293b' }}>
                    {format(zonedStart, 'h:mm a')} – {format(zonedEnd, 'h:mm a')}
                  </Text>
                  <Text style={{ margin: '0 0 4px 0', fontSize: '14px', color: '#334155' }}>
                    <strong>{booking.guest_name}</strong> — {booking.sessionType.name}
                  </Text>
                  {booking.notes && (
                    <Text style={{ margin: '0 0 4px 0', fontSize: '13px', color: '#64748b', fontStyle: 'italic' }}>
                      Note: {booking.notes}
                    </Text>
                  )}
                  <Text style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#94a3b8' }}>
                    <a href={bookingUrl} style={{ color: '#3b82f6', textDecoration: 'none' }}>
                      View booking →
                    </a>
                  </Text>
                </Section>
              );
            })}

            <Hr style={{ margin: '24px 0', border: 'none', borderTop: '1px solid #e2e8f0' }} />

            <Section style={{ textAlign: 'center' }}>
              <Button
                href={`${appUrl}/dashboard`}
                style={{
                  display: 'inline-block',
                  backgroundColor: '#3b82f6',
                  color: '#ffffff',
                  padding: '12px 24px',
                  borderRadius: '6px',
                  textDecoration: 'none',
                  fontWeight: '500',
                }}
              >
                Go to Dashboard
              </Button>
            </Section>

            <Hr style={{ margin: '24px 0', border: 'none', borderTop: '1px solid #e2e8f0' }} />

            <Text style={{ margin: '0', fontSize: '12px', color: '#94a3b8', textAlign: 'center' }}>
              All times shown in {practitionerTimezone.replace(/_/g, ' ')}.
              To stop receiving these emails, turn off Email Reminders in your{' '}
              <a href={`${appUrl}/dashboard/settings`} style={{ color: '#94a3b8' }}>Settings</a>.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export const dailyDigestEmailText = (props: DailyDigestEmailProps): string => {
  const { practitioner, bookings, date } = props;
  const count = bookings.length;
  const practitionerTimezone = practitioner.timezone || 'UTC';
  const appUrl = getAppUrl();
  const formattedDate = format(new Date(date + 'T12:00:00'), 'EEEE, MMMM d, yyyy');

  const bookingLines = bookings
    .map((booking) => {
      const zonedStart = utcToZonedTime(new Date(booking.starts_at), practitionerTimezone);
      const zonedEnd = utcToZonedTime(new Date(booking.ends_at), practitionerTimezone);
      const lines = [
        `${format(zonedStart, 'h:mm a')} – ${format(zonedEnd, 'h:mm a')}`,
        `  ${booking.guest_name} — ${booking.sessionType.name}`,
      ];
      if (booking.notes) {
        lines.push(`  Note: ${booking.notes}`);
      }
      lines.push(`  ${appUrl}/booking/${booking.booking_token}`);
      return lines.join('\n');
    })
    .join('\n\n');

  return `
Your schedule for tomorrow — ${count} booking${count !== 1 ? 's' : ''}

Hi ${practitioner.display_name}, you have ${count} booking${count !== 1 ? 's' : ''} on ${formattedDate}.

${bookingLines}

Go to Dashboard: ${appUrl}/dashboard

All times shown in ${practitionerTimezone}.
To stop receiving these emails, turn off Email Reminders in your Settings: ${appUrl}/dashboard/settings
  `.trim();
};
