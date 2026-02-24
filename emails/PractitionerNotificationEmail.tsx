import React from 'react';
import {
  Html,
  Head,
  Preview,
  Body,
  Container,
  Section,
  Text,
  Heading,
  Hr,
} from '@react-email/components';
import { format } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import type { Booking, SessionType, Practitioner } from '../types/database';

interface PractitionerNotificationEmailProps {
  booking: Booking;
  sessionType: SessionType;
  practitioner: Practitioner;
}

export function PractitionerNotificationEmail({
  booking,
  sessionType,
  practitioner,
}: PractitionerNotificationEmailProps) {
  // Format the booking time in the practitioner's timezone
  const practitionerTimezone = practitioner.timezone;
  const startsAt = new Date(booking.starts_at);
  const endsAt = new Date(booking.ends_at);
  const zonedStart = toZonedTime(startsAt, practitionerTimezone);
  const zonedEnd = toZonedTime(endsAt, practitionerTimezone);

  const formattedDate = format(zonedStart, 'EEEE, MMMM d, yyyy');
  const formattedTime = `${format(zonedStart, 'h:mm a')} - ${format(zonedEnd, 'h:mm a')}`;
  const timezoneDisplay = practitionerTimezone.replace(/_/g, ' ');

  return (
    <Html>
      <Head />
      <Preview>
        New booking: {booking.guest_name}
      </Preview>
      <Body style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', backgroundColor: '#f8fafc' }}>
        <Container style={{ margin: '0 auto', padding: '40px 20px', maxWidth: '600px' }}>
          <Section style={{ backgroundColor: '#ffffff', borderRadius: '8px', padding: '32px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <Heading style={{ margin: '0 0 16px 0', fontSize: '24px', fontWeight: '600', color: '#1e293b' }}>
              New Booking Received 📅
            </Heading>

            <Text style={{ margin: '0 0 24px 0', fontSize: '16px', color: '#475569' }}>
              You have a new {sessionType.name} scheduled.
            </Text>

            {/* Guest Details */}
            <Section style={{ backgroundColor: '#f8fafc', borderRadius: '6px', padding: '20px', marginBottom: '24px' }}>
              <Text style={{ margin: '0 0 8px 0', fontSize: '14px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Guest Information
              </Text>
              <Text style={{ margin: '0 0 12px 0', fontSize: '18px', fontWeight: '600', color: '#1e293b' }}>
                {booking.guest_name}
              </Text>
              <Text style={{ margin: '0', fontSize: '14px', color: '#334155' }}>
                {booking.guest_email}
              </Text>
            </Section>

            {/* Booking Details */}
            <Section style={{ backgroundColor: '#f8fafc', borderRadius: '6px', padding: '20px', marginBottom: '24px' }}>
              <Text style={{ margin: '0 0 8px 0', fontSize: '14px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Session Details
              </Text>
              <Text style={{ margin: '0 0 8px 0', fontSize: '16px', fontWeight: '600', color: '#1e293b' }}>
                {sessionType.name}
              </Text>
              <Text style={{ margin: '0 0 8px 0', fontSize: '15px', color: '#334155' }}>
                {formattedDate}
              </Text>
              <Text style={{ margin: '0', fontSize: '14px', color: '#64748b' }}>
                {formattedTime} ({timezoneDisplay})
              </Text>
            </Section>

            {booking.notes && (
              <>
                <Text style={{ margin: '0 0 8px 0', fontSize: '14px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Notes from Guest
                </Text>
                <Section style={{ backgroundColor: '#f0fdf4', borderRadius: '6px', padding: '16px', marginBottom: '24px' }}>
                  <Text style={{ margin: '0', fontSize: '14px', color: '#166534', whiteSpace: 'pre-wrap' }}>
                    {booking.notes}
                  </Text>
                </Section>
              </>
            )}

            <Hr style={{ margin: '24px 0', border: 'none', borderTop: '1px solid #e2e8f0' }} />

            {/* Footer */}
            <Text style={{ margin: '0', fontSize: '12px', color: '#94a3b8', textAlign: 'center' }}>
              Booking Reference: {booking.booking_token}
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export const practitionerNotificationEmailText = (props: PractitionerNotificationEmailProps): string => {
  const { booking, sessionType, practitioner } = props;
  const practitionerTimezone = practitioner.timezone;
  const zonedStart = toZonedTime(new Date(booking.starts_at), practitionerTimezone);
  const zonedEnd = toZonedTime(new Date(booking.ends_at), practitionerTimezone);

  return `
New Booking Received

You have a new ${sessionType.name} scheduled.

Guest Information:
- Name: ${booking.guest_name}
- Email: ${booking.guest_email}

Session Details:
- Type: ${sessionType.name}
- Date: ${format(zonedStart, 'EEEE, MMMM d, yyyy')}
- Time: ${format(zonedStart, 'h:mm a')} - ${format(zonedEnd, 'h:mm a')} (${practitionerTimezone})

${booking.notes ? `Notes from Guest:\n${booking.notes}` : ''}

Booking Reference: ${booking.booking_token}
  `.trim();
};
