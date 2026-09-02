import React, { useState } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { Sidebar } from './components/common/Sidebar';
import { Header } from './components/common/Header';
import { BottomNav } from './components/mobile/BottomNav';
import { LoginScreen } from './components/auth/LoginScreen';
import { AdminResetPasswordScreen } from './components/auth/AdminResetPasswordScreen';
import { ApprovalsPage } from './components/approvals/ApprovalsPage';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { useIsMobile } from './hooks/useMediaQuery';

// Admin Views
import { AdminDashboard } from './components/dashboard/AdminDashboard';
import { ServiceRequestsPage } from './components/requests/ServiceRequestsPage';
import { CustomersPage } from './components/customers/CustomersPage';
import { LocationsPage } from './components/locations/LocationsPage';
import { RoomsEquipmentPage } from './components/assets/RoomsEquipmentPage';
import { TechniciansPage } from './components/technicians/TechniciansPage';
import { InstallationsPage } from './components/installations/InstallationsPage';
import { TechProfilePage } from './components/profile/TechProfilePage';
import { ServiceCalendarPage } from './components/calendar/ServiceCalendarPage';
import { ServiceHistoryPage } from './components/history/ServiceHistoryPage';
import { SettingsPage } from './components/settings/SettingsPage';
import { InventoryPage } from './components/inventory/InventoryPage';
import { DemosPage } from './components/demos/DemosPage';
import { AdminProfilePage } from './components/profile/AdminProfilePage';
import { UserManagementPage } from './components/users/UserManagementPage';
import { ReportsPage } from './components/reports/ReportsPage';

// Tech Views
import { TechDashboard } from './components/dashboard/TechDashboard';
import { TechJobsPage } from './components/requests/TechJobsPage';

// Modals & Panels
import { TicketDetailsModal } from './components/requests/TicketDetailsModal';
import { TechJobDetailsModal } from './components/requests/TechJobDetailsModal';
import { AssignTechModal } from './components/requests/AssignTechModal';
import { CreateTicketModal } from './components/requests/CreateTicketModal';
import { CustomerDetailModal } from './components/customers/CustomerDetailModal';
import { RoomDetailModal } from './components/assets/RoomDetailModal';
import { TechProfileModal } from './components/technicians/TechProfileModal';
import { TechServiceFormModal } from './components/requests/TechServiceFormModal';
import { GlobalSearchModal } from './components/common/GlobalSearchModal';
import { NotificationsDrawer } from './components/common/NotificationsDrawer';
import { ToastContainer } from './components/common/ToastContainer';

const MainLayout = () => {
  const { isLoggedIn, isRestoringSession, role, activePage } = useApp();
  const isMobile = useIsMobile();

  // The password-reset link emailed to an admin lands here. Checked before the
  // login gate, since the admin is by definition signed out at this point.
  // Suffix match, not an exact compare: in production the app is mounted under
  // /ticket/, so the emailed link lands on /ticket/reset-password.
  const [resetToken] = useState(() =>
    window.location.pathname.replace(/\/+$/, '').endsWith('/reset-password')
      ? new URLSearchParams(window.location.search).get('token') || ''
      : null
  );

  if (resetToken !== null) {
    return (
      <AdminResetPasswordScreen
        token={resetToken}
        onDone={() => {
          window.history.pushState({}, '', import.meta.env.BASE_URL);
          window.location.reload();
        }}
      />
    );
  }

  // Validating a stored token — don't paint the dashboard or the login screen yet.
  if (isRestoringSession) {
    return (
      <div className="min-h-screen bg-[#F6F8FB] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-[#004898] border-t-transparent animate-spin" />
          <p className="text-xs font-semibold text-[#667085]">Restoring your session…</p>
        </div>
      </div>
    );
  }

  if (!isLoggedIn) {
    return <LoginScreen />;
  }

  const renderActivePage = () => {
    if (role === 'admin') {
      switch (activePage) {
        case 'dashboard':
          return <AdminDashboard />;
        case 'approvals':
          return <ApprovalsPage />;
        case 'requests':
          return <ServiceRequestsPage />;
        case 'customers':
          return <CustomersPage />;
        case 'locations':
          return <LocationsPage />;
        case 'rooms':
          return <RoomsEquipmentPage />;
        case 'technicians':
          return <TechniciansPage />;
        case 'installations':
          return <InstallationsPage />;
        case 'inventory':
          return <InventoryPage />;
        case 'demos':
          return <DemosPage />;
        case 'calendar':
          return <ServiceCalendarPage />;
        case 'history':
          return <ServiceHistoryPage />;
        case 'reports':
          return <ReportsPage />;
        case 'staff':
          return <UserManagementPage />;
        case 'settings':
          return <SettingsPage />;
        case 'profile':
          return <AdminProfilePage />;
        default:
          return <AdminDashboard />;
      }
    } else {
      // Technician view
      switch (activePage) {
        case 'my-dashboard':
          return <TechDashboard />;
        case 'my-jobs':
          return <TechJobsPage />;
        case 'demos':
          return <DemosPage />;
        case 'calendar':
          return <ServiceCalendarPage />;
        case 'history':
          return <ServiceHistoryPage />;
        case 'installations':
          return <InstallationsPage />;
        case 'profile':
          return <TechProfilePage />;
        default:
          return <TechDashboard />;
      }
    }
  };

  return (
    <div className="flex min-h-screen bg-[#F8FAFC]">
      {/* Desktop Sidebar - Hidden on Mobile */}
      <div className="hidden md:block">
        <Sidebar />
      </div>

      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        <Header />
        <main className={`flex-1 overflow-y-auto bg-transparent relative z-0 ${
          isMobile ? 'p-4 pb-24' : 'p-6 lg:p-8'
        }`}>
          <ErrorBoundary key={activePage}>
            {renderActivePage()}
          </ErrorBoundary>
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <BottomNav />

      {/* Global Modals & Notifications Overlays */}
      <TicketDetailsModal />
      <TechJobDetailsModal />
      <AssignTechModal />
      <CreateTicketModal />
      <CustomerDetailModal />
      <RoomDetailModal />
      <TechProfileModal />
      <TechServiceFormModal />
      <GlobalSearchModal />
      <NotificationsDrawer />
      <ToastContainer />
    </div>
  );
};

export default function App() {
  return (
    <AppProvider>
      <MainLayout />
    </AppProvider>
  );
}
