import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from '@/hooks/useAuth';
import BookingPage from '@/pages/BookingPage';
import BookingConfirmationPage from '@/pages/BookingConfirmationPage';
import EmbedPage from '@/pages/EmbedPage';
import LoginPage from '@/pages/LoginPage';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import DashboardBookings from '@/pages/dashboard/DashboardBookings';
import DashboardAvailability from '@/pages/dashboard/DashboardAvailability';
import DashboardSessions from '@/pages/dashboard/DashboardSessions';
import DashboardSettings from '@/pages/dashboard/DashboardSettings';
import SignupPage from '@/pages/SignupPage';
import OnboardingPage from '@/pages/OnboardingPage';

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        {/* Public routes */}
        <Route path="/book/:username" element={<BookingPage />} />
        <Route path="/booking/:token" element={<BookingConfirmationPage />} />
        <Route path="/embed/:username" element={<EmbedPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/onboarding" element={<OnboardingPage />} />

        {/* Dashboard routes */}
        <Route path="/dashboard" element={<DashboardLayout />}>
          <Route index element={<DashboardBookings />} />
          <Route path="availability" element={<DashboardAvailability />} />
          <Route path="sessions" element={<DashboardSessions />} />
          <Route path="settings" element={<DashboardSettings />} />
        </Route>

        {/* Fallback */}
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </AuthProvider>
  );
}
