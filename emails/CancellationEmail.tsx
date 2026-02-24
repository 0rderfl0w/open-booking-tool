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

interface CancellationEmailProps {
  booking: Booking;
  sessionType: SessionType;
  practitioner: Practitioner;
}

export function CancellationEmail({
  booking,
  sessionType,
  practitioner,
}: CancellationEmailProps) {
  const appUrl = getAppUrl();
  const bookingPageUrl = `${appUrl}/book/${practitioner.username}`;

  // Format the original booking time in the guest's timezone
  const guestTimezone = booking.guest_timezone || 'UTC';
  const startsAt = new Date(booking.starts_at);
  const zonedStart = utcToZonedTime(startsAt, guestTimezone);

  const formattedDate = format(zonedStart, 'EEEE, MMMM d, yyyy');
  const formattedTime = format(zonedStart, 'h:mm a');

  return (
    <Html>
      <Head />
      <Preview>
        Your booking with {practitioner.display_name} has been cancelled
      </Preview>
      <Body style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', backgroundColor: '#f8fafc' }}>
        <Container style={{ margin: '0 auto', padding: '40px 20px', maxWidth: '600px' }}>
          <Section style={{ backgroundColor: '#ffffff', borderRadius: '8px', padding: '32px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <Heading style={{ margin: '0 0 16px 0', fontSize: '24px', fontWeight: '600', color: '#1e293b' }}>
              Booking Cancelled
            </Heading>

            <Text style={{ margin: '0 0 24px 0', fontSize: '16px', color: '#475569' }}>
              Hi {booking.guest_name},<br /><br />
              Your {sessionType.name} with <strong>{practitioner.display_name}</strong> on <strong>{formattedDate}</strong> at <strong>{formattedTime}</strong> has been cancelled.
            </Text>

            {booking.cancellation_reason && (
              <Section style={{ backgroundColor: '#fef2f2', borderRadius: '6px', padding: '16px', marginBottom: '24px' }}>
                <Text style={{ margin: '0', fontSize: '14px', color: '#991b1b' }}>
                  <strong>Cancellation reason:</strong><br />
                  {booking.cancellation_reason}
                </Text>
              </Section>
            )}

            <Hr style={{ margin: '24px 0', border: 'none', borderTop: '1px solid #e2e8f0' }} />

            {/* Action Button */}
            <Section style={{ textAlign: 'center' }}>
              <Button
                href={bookingPageUrl}
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
                Book Another Session
              </Button>
            </Section>

            <Hr style={{ margin: '24px 0', border: 'none', borderTop: '1px solid #e2e8f0' }} />

            {/* Footer */}
            <Text style={{ margin: '0', fontSize: '12px', color: '#94a3b8', textAlign: 'center' }}>
              Original Booking Reference: {booking.booking_token}
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export const cancellationEmailText = (props: CancellationEmailProps): string => {
  const { booking, sessionType, practitioner } = props;
  const guestTimezone = booking.guest_timezone || 'UTC';
  const zonedStart = utcToZonedTime(new Date(booking.starts_at), guestTimezone);

  return `
Booking Cancelled

Hi ${booking.guest_name},

Your ${sessionType.name} with ${practitioner.display_name} on ${format(zonedStart, 'EEEE, MMMM d, yyyy')} at ${format(zonedStart, 'h:mm a')} has been cancelled.

${booking.cancellation_reason ? `Cancellation reason: ${booking.cancellation_reason}` : ''}

Book another session: ${getAppUrl()}/book/${practitioner.username}

Original Booking Reference: ${booking.booking_token}
  `.trim();
};
