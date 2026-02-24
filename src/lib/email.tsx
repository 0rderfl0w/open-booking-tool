// Stub email service - implement with Resend SDK
// This is a placeholder - implement actual email sending with Resend

export async function sendConfirmationEmail(to: string, bookingData: unknown) {
  console.log(`[Email] Would send confirmation to ${to}`, bookingData);
  // TODO: Implement with Resend
  return { success: true };
}

export async function sendCancellationEmail(to: string, bookingData: unknown) {
  console.log(`[Email] Would send cancellation to ${to}`, bookingData);
  return { success: true };
}

export async function sendPractitionerNotificationEmail(to: string, bookingData: unknown) {
  console.log(`[Email] Would send practitioner notification to ${to}`, bookingData);
  return { success: true };
}
