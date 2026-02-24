import { Resend } from 'resend';
import {
  ConfirmationEmail,
  confirmationEmailText,
  CancellationEmail,
  cancellationEmailText,
  PractitionerNotificationEmail,
  practitionerNotificationEmailText,
} from '../../emails';
import type { Booking, SessionType, Practitioner } from '../types/database';

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM_EMAIL = 'Build to Own Club <noreply@buildtoown.club>';

interface EmailBookingData {
  booking: Booking;
  sessionType: SessionType;
  practitioner: Practitioner;
}

export async function sendConfirmationEmail(to: string, data: EmailBookingData) {
  const { booking, sessionType, practitioner } = data;

  const { error } = await resend.emails.send({
    from: FROM_EMAIL,
    to,
    replyTo: practitioner.email,
    subject: `Booking confirmed: ${sessionType.name} with ${practitioner.display_name}`,
    react: <ConfirmationEmail booking={booking} sessionType={sessionType} practitioner={practitioner} />,
    text: confirmationEmailText({ booking, sessionType, practitioner }),
  });

  if (error) {
    console.error('[Email] Failed to send confirmation:', error);
    throw new Error(`Email send failed: ${error.message}`);
  }

  return { success: true };
}

export async function sendCancellationEmail(to: string, data: EmailBookingData) {
  const { booking, sessionType, practitioner } = data;

  const { error } = await resend.emails.send({
    from: FROM_EMAIL,
    to,
    replyTo: practitioner.email,
    subject: `Booking cancelled: ${sessionType.name} with ${practitioner.display_name}`,
    react: <CancellationEmail booking={booking} sessionType={sessionType} practitioner={practitioner} />,
    text: cancellationEmailText({ booking, sessionType, practitioner }),
  });

  if (error) {
    console.error('[Email] Failed to send cancellation:', error);
    throw new Error(`Email send failed: ${error.message}`);
  }

  return { success: true };
}

export async function sendPractitionerNotificationEmail(to: string, data: EmailBookingData) {
  const { booking, sessionType, practitioner } = data;

  const { error } = await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject: `New booking: ${sessionType.name} — ${booking.guest_name}`,
    react: <PractitionerNotificationEmail booking={booking} sessionType={sessionType} practitioner={practitioner} />,
    text: practitionerNotificationEmailText({ booking, sessionType, practitioner }),
  });

  if (error) {
    console.error('[Email] Failed to send practitioner notification:', error);
    throw new Error(`Email send failed: ${error.message}`);
  }

  return { success: true };
}
