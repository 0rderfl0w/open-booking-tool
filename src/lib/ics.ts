// Stub ICS generator - implement with ical-generator
// This is a placeholder

export function generateICSBuffer(_booking: unknown, _sessionType: unknown, _practitioner: unknown, guestEmail: string, isCancellation = false): string {
  console.log(`[ICS] Would generate ICS for ${guestEmail}, cancellation: ${isCancellation}`);
  // TODO: Implement with ical-generator
  return 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n';
}
