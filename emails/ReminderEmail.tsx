import { EmailSignature } from './components/EmailSignature';
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
  Img,
} from '@react-email/components';
import { format } from 'date-fns';
import { utcToZonedTime } from 'date-fns-tz';
import type { Booking, SessionType, Practitioner } from '../src/types/database';
import { getAppUrl } from '../src/lib/constants';

interface ReminderEmailProps {
  booking: Booking;
  sessionType: SessionType;
  practitioner: Practitioner;
}

export function ReminderEmail({
  booking,
  sessionType,
  practitioner,
}: ReminderEmailProps) {
  const appUrl = getAppUrl();
  const bookingUrl = `${appUrl}/booking/${booking.booking_token}`;
  const cancelUrl = `${appUrl}/booking/${booking.booking_token}/cancel`;

  // Format the booking time in the guest's timezone
  const guestTimezone = booking.guest_timezone || 'UTC';
  const startsAt = new Date(booking.starts_at);
  const endsAt = new Date(booking.ends_at);
  const zonedStart = utcToZonedTime(startsAt, guestTimezone);
  const zonedEnd = utcToZonedTime(endsAt, guestTimezone);

  const formattedDate = format(zonedStart, 'EEEE, MMMM d, yyyy');
  const formattedTime = `${format(zonedStart, 'h:mm a')} - ${format(zonedEnd, 'h:mm a')}`;
  const timezoneDisplay = guestTimezone.replace(/_/g, ' ');

  return (
    <Html>
      <Head />
      <Preview>
        Reminder: Your {sessionType.name} with {practitioner.display_name} is tomorrow
      </Preview>
      <Body style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', backgroundColor: '#f8fafc' }}>
        <Container style={{ margin: '0 auto', padding: '40px 20px', maxWidth: '600px' }}>
          <Section style={{ backgroundColor: '#ffffff', borderRadius: '8px', padding: '32px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            {/* Practitioner Header */}
            {practitioner.photo_url && (
              <Img
                src={practitioner.photo_url}
                alt={practitioner.display_name}
                width="64"
                height="64"
                style={{ borderRadius: '50%', marginBottom: '16px' }}
              />
            )}

            <Heading style={{ margin: '0 0 16px 0', fontSize: '24px', fontWeight: '600', color: '#1e293b' }}>
              Your session is tomorrow 🗓
            </Heading>

            <Text style={{ margin: '0 0 24px 0', fontSize: '16px', color: '#475569' }}>
              Hi {booking.guest_name},<br /><br />
              Just a reminder — your <strong>{sessionType.name}</strong> with{' '}
              <strong>{practitioner.display_name}</strong> is coming up tomorrow.
            </Text>

            {/* Booking Details */}
            <Section style={{ backgroundColor: '#f8fafc', borderRadius: '6px', padding: '20px', marginBottom: '24px' }}>
              <Text style={{ margin: '0 0 8px 0', fontSize: '14px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Date & Time
              </Text>
              <Text style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: '600', color: '#1e293b' }}>
                {formattedDate}
              </Text>
              <Text style={{ margin: '0 0 4px 0', fontSize: '16px', color: '#334155' }}>
                {formattedTime}
              </Text>
              <Text style={{ margin: '0', fontSize: '14px', color: '#64748b' }}>
                ({timezoneDisplay})
              </Text>
            </Section>

            {sessionType.description && (
              <Text style={{ margin: '0 0 24px 0', fontSize: '14px', color: '#475569' }}>
                {sessionType.description}
              </Text>
            )}

            <Hr style={{ margin: '24px 0', border: 'none', borderTop: '1px solid #e2e8f0' }} />

            {/* Action Buttons */}
            <Section style={{ textAlign: 'center' }}>
              <Button
                href={bookingUrl}
                style={{
                  display: 'inline-block',
                  backgroundColor: '#3b82f6',
                  color: '#ffffff',
                  padding: '12px 24px',
                  borderRadius: '6px',
                  textDecoration: 'none',
                  fontWeight: '500',
                  marginBottom: '12px',
                }}
              >
                View Booking Details
              </Button>
              <br />
              <Button
                href={cancelUrl}
                style={{
                  display: 'inline-block',
                  backgroundColor: '#ffffff',
                  color: '#64748b',
                  padding: '12px 24px',
                  borderRadius: '6px',
                  textDecoration: 'none',
                  fontWeight: '500',
                  border: '1px solid #e2e8f0',
                }}
              >
                Cancel Booking
              </Button>
            </Section>

            <Hr style={{ margin: '24px 0', border: 'none', borderTop: '1px solid #e2e8f0' }} />

            {/* Footer */}
            <Text style={{ margin: '0', fontSize: '12px', color: '#94a3b8', textAlign: 'center' }}>
              Booking Reference: {booking.booking_token}
            </Text>

            <EmailSignature practitioner={practitioner} />
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export const reminderEmailText = (props: ReminderEmailProps): string => {
  const { booking, sessionType, practitioner } = props;
  const guestTimezone = booking.guest_timezone || 'UTC';
  const zonedStart = utcToZonedTime(new Date(booking.starts_at), guestTimezone);
  const zonedEnd = utcToZonedTime(new Date(booking.ends_at), guestTimezone);
  const appUrl = getAppUrl();

  return `
Reminder: Your ${sessionType.name} with ${practitioner.display_name} is tomorrow

Hi ${booking.guest_name},

Just a reminder — your ${sessionType.name} with ${practitioner.display_name} is coming up tomorrow.

Date: ${format(zonedStart, 'EEEE, MMMM d, yyyy')}
Time: ${format(zonedStart, 'h:mm a')} - ${format(zonedEnd, 'h:mm a')} (${guestTimezone})

${sessionType.description || ''}

View details: ${appUrl}/booking/${booking.booking_token}
Cancel booking: ${appUrl}/booking/${booking.booking_token}/cancel

Booking Reference: ${booking.booking_token}
  

---
${practitioner.display_name}
${practitioner.email}
  `.trim();
};
