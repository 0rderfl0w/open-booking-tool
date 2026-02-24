/**
 * Dashboard layout with sidebar navigation.
 * Desktop: persistent sidebar. Mobile: top nav bar.
 *
 * TODO: Implement (subagent task)
 */
import { Outlet } from 'react-router-dom';

export default function DashboardLayout() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="flex">
        {/* Sidebar placeholder */}
        <aside className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 bg-white border-r border-gray-200">
          <nav className="flex-1 p-4 space-y-2">
            <a href="/dashboard" className="block px-3 py-2 rounded-lg text-gray-700 hover:bg-gray-100">
              Bookings
            </a>
            <a href="/dashboard/availability" className="block px-3 py-2 rounded-lg text-gray-700 hover:bg-gray-100">
              Availability
            </a>
            <a href="/dashboard/sessions" className="block px-3 py-2 rounded-lg text-gray-700 hover:bg-gray-100">
              Session Types
            </a>
            <a href="/dashboard/settings" className="block px-3 py-2 rounded-lg text-gray-700 hover:bg-gray-100">
              Settings
            </a>
          </nav>
        </aside>

        {/* Main content */}
        <main className="flex-1 md:ml-64 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
