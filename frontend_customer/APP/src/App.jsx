import React, { useEffect, useState } from 'react';

import { Header } from './components/Header';
import { BottomNav } from './components/BottomNav';

import { SplashScreen } from './screens/SplashScreen';
import { LoginScreen } from './screens/LoginScreen';
import { HomeScreen } from './screens/HomeScreen';
import { BookServiceWizard } from './screens/BookServiceWizard';
import { SuccessScreen } from './screens/SuccessScreen';
import { ResetPasswordScreen } from './screens/ResetPasswordScreen';
import { ActivateAccountScreen } from './screens/ActivateAccountScreen';
import { RequestTrackingScreen } from './screens/RequestTrackingScreen';
import { MyRequestsScreen } from './screens/MyRequestsScreen';
import { NotificationsScreen } from './screens/NotificationsScreen';
import { ProfileScreen } from './screens/ProfileScreen';

import { QRScannerModal } from './components/QRScannerModal';
import { ServiceCompletionModal } from './components/ServiceCompletionModal';
import { FeedbackModal } from './components/FeedbackModal';
import { SkeletonLoader } from './components/SkeletonLoader';
import { NotificationToast } from './components/NotificationToast';
import { sendWebPushNotification } from './utils/notifications';
import unifiedClient from './api/unifiedClient';
import { APP_COMPANY_NAME } from './utils/branding';

// Removed mockData imports - using real API data only

import {
  fetchLocations,
  fetchRooms,
  fetchServiceRequests,
  createServiceRequest,
  updateServiceRequest,
} from './services/dataService';


function App() {

  useEffect(() => {
    localStorage.removeItem('tasktel_created_tickets');
    localStorage.removeItem('tasktel_active_user');
    Object.keys(localStorage)
      .filter((key) => key.startsWith('demo_password_'))
      .forEach((key) => localStorage.removeItem(key));
    sessionStorage.clear();
    if ('caches' in window) {
      window.caches.keys().then((keys) => Promise.all(keys.map((key) => window.caches.delete(key))));
    }
  }, []);

  // =========================================================
  // NAVIGATION
  // =========================================================

  const [currentScreen, setCurrentScreen] = useState(() => {
    // Suffix match, not an exact compare: in production the app is mounted under
    // /customer/, so emailed links land on /customer/reset-password etc.
    const path = window.location.pathname.replace(/\/+$/, '');
    if (path.endsWith('/reset-password')) return 'reset';
    if (path.endsWith('/activate-account')) return 'activate';
    // A stored token is not trusted until /auth/me confirms it below; show the
    // loader meanwhile rather than flashing the dashboard.
    if (localStorage.getItem('tasktel_access_token')) return 'restoring';
    return 'splash';
  });

  const [activationToken] = useState(
    () => new URLSearchParams(window.location.search).get('token') || ''
  );
  const [activeTab, setActiveTab] = useState('home');


  // =========================================================
  // USER / CUSTOMER DATA
  // =========================================================

  const [user, setUser] = useState(null);
  const [customer, setCustomer] = useState(null);

  // =========================================================
  // APP STATE & DATA
  // =========================================================

  const [rooms, setRooms] = useState([]);
  const [locations, setLocations] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [loadingData, setLoadingData] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [wizardPreselectedRoomId, setWizardPreselectedRoomId] = useState(null);
  const [wizardServiceType, setWizardServiceType] = useState('AV');


  // =========================================================
  // MODALS
  // =========================================================

  const [showQrModal, setShowQrModal] = useState(false);
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [activeToast, setActiveToast] = useState(null);

  useEffect(() => {
    if (!localStorage.getItem('tasktel_access_token')) return;

    unifiedClient.getCurrentUser()
      .then((response) => {
        const account = response.data;
        setUser({
          ...account,
          company: account.company_name || '',
          role: 'Customer'
        });
        setCurrentScreen((screen) => (screen === 'restoring' ? 'home' : screen));
      })
      .catch(() => {
        unifiedClient.clearTokens();
        setCurrentScreen('login');
      });
  }, []);


  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isFullViewport, setIsFullViewport] = useState(false);

  // =========================================================
  // API DATA LOAD
  // =========================================================

  useEffect(() => {
    const loadApiData = async () => {
      try {
        setLoadingData(true);
        const [locationsData, roomsData, requestsData] = await Promise.all([
          fetchLocations(),
          fetchRooms(),
          user?.id ? fetchServiceRequests(user.id) : Promise.resolve([])
        ]);
        setLocations(locationsData || []);
        setRooms(roomsData || []);
        setTickets(requestsData || []);
        setSelectedTicket((requestsData || [])[0] || null);
      } catch (error) {
        console.warn('Customer data load failed:', error);
        setTickets([]);
        setSelectedTicket(null);
      } finally {
        setLoadingData(false);
      }
    };

    loadApiData();

  }, [user?.id]);

  // Keep selectedTicket synchronized with tickets state updates
  useEffect(() => {
    if (selectedTicket) {
      const isSame = (a, b) => (a || '').toString().replace(/^#/, '').toLowerCase().trim() === (b || '').toString().replace(/^#/, '').toLowerCase().trim();
      const targetId = selectedTicket.id || selectedTicket.ticketNumber;
      const fresh = tickets.find(t => isSame(t.id || t.ticketNumber, targetId));
      if (fresh && (fresh.status !== selectedTicket.status || fresh.currentStepIndex !== selectedTicket.currentStepIndex || fresh.serviceReport !== selectedTicket.serviceReport || fresh.isCompleted !== selectedTicket.isCompleted)) {
        setSelectedTicket(fresh);
      }
    }
  }, [tickets, selectedTicket]);


  // =========================================================
  // ACTIVE TICKET
  // =========================================================

  const activeTicket =
    tickets.find((ticket) => !ticket.isCompleted) || null;


  // =========================================================
  // BOTTOM NAVIGATION
  // =========================================================

  const handleTabChange = (tabKey) => {
    setActiveTab(tabKey);
    if (tabKey === 'home') setCurrentScreen('home');
    if (tabKey === 'requests') setCurrentScreen('requests');
    if (tabKey === 'profile') setCurrentScreen('profile');
  };


  // =========================================================
  // OPEN BOOK SERVICE WIZARD
  // =========================================================

  const handleOpenWizard = (preselectedRoomId = null, serviceType = 'AV') => {
    setWizardPreselectedRoomId(preselectedRoomId);
    setWizardServiceType(typeof serviceType === 'string' ? serviceType : 'AV');
    setCurrentScreen('wizard');
  };


  // =========================================================
  // WIZARD COMPLETE (CREATE TICKET THROUGH API)
  // =========================================================

  const handleWizardComplete = async (newTicket) => {
    const ticketWithUser = {
      ...newTicket,
      customerId: user?.id,
      customerName: user?.name || '',
      companyName: user?.company || user?.company_name || '',
      company: user?.company || user?.company_name || '',
      createdBy: {
        id: user?.id,
        name: user?.name || '',
        role: user?.role || 'Customer',
        email: user?.email || ''
      }
    };
    let finalTicket;

    try {
      const createdDbTicket = await createServiceRequest(ticketWithUser);
      finalTicket = { ...createdDbTicket, createdBy: ticketWithUser.createdBy };
    } catch (err) {
      console.error('Service request creation failed:', err);
      setActiveToast({ title: 'Request not created', message: err.message || 'Please try again.' });
      return;
    }

    setTickets((previousTickets) => [finalTicket, ...previousTickets]);
    setSelectedTicket(finalTicket);

    const title = 'Service Request Submitted';
    const scope = finalTicket.roomName || finalTicket.room
      || finalTicket.locationName || finalTicket.location || 'your request';
    const message = `Ticket #${finalTicket.ticketNumber || finalTicket.id} created for ${scope}.`;

    const newNotification = {
      id: `notif-${Date.now()}`,
      title,
      message,
      time: 'Just Now',
      unread: true,
      ticketId: finalTicket.id
    };

    setNotifications((previousNotifications) => [
      newNotification,
      ...previousNotifications
    ]);

    // Fire Web Push & In-App Toast Alert
    sendWebPushNotification(title, message);
    setActiveToast({ title, message, ticketId: finalTicket.id });

    setCurrentScreen('success');
  };


  // =========================================================
  // ADVANCE TICKET STATUS
  // =========================================================

  const handleAdvanceTicketStatus = async () => {
    if (!activeTicket) return;

    const currentIndex = activeTicket.currentStepIndex || 0;
    const timelineSteps = ['Request Submitted', 'Under Review', 'Assigned', 'In Progress', 'Pending Approval', 'Completed'];
    const nextIndex = (currentIndex + 1) % timelineSteps.length;
    const nextStep = timelineSteps[nextIndex];

    if (activeTicket.dbId) {
      try {
        await updateServiceRequest(
          activeTicket.dbId,
          nextIndex,
          nextStep.key === 'resolved' ? 'Camera firmware updated & system verified.' : null
        );
      } catch (err) {
        console.warn('Service request status update failed:', err);
      }
    }

    const isNowResolved = nextStep.key === 'resolved';
    const updatedTickets = tickets.map((ticket) => {
      if (ticket.id !== activeTicket.id) return ticket;

      return {
        ...ticket,
        currentStepIndex: nextIndex,
        status: isNowResolved ? 'Resolved' : nextStep.label,
        resolution: isNowResolved
          ? 'Camera firmware updated & system verified.'
          : ticket.resolution
      };
    });

    setTickets(updatedTickets);

    const title = isNowResolved ? 'Service Ticket Resolved' : `Status Update: ${nextStep.label}`;
    const message = isNowResolved
      ? `Ticket #${activeTicket.id} resolved by engineer. System verified.`
      : `Ticket #${activeTicket.id} moved to ${nextStep.label}. ${nextStep.desc}.`;

    const newNotification = {
      id: `notif-${Date.now()}`,
      title,
      message,
      time: 'Just Now',
      unread: true,
      ticketId: activeTicket.id
    };

    setNotifications((prev) => [newNotification, ...prev]);

    // Fire Web Push & In-App Toast Alert
    sendWebPushNotification(title, message);
    setActiveToast({ title, message, ticketId: activeTicket.id });

    if (isNowResolved) {
      setShowCompletionModal(true);
    }
  };


  const handleUpdateTicket = async (updatedTicket) => {
    let finalTicket = updatedTicket;

    // The customer sign-off: they typed their name and drew a signature. We
    // persist only the fact that they signed (+ their name), never the image.
    if (updatedTicket.customerSignedNow && updatedTicket.dbId && updatedTicket.dbStatus !== 'resolved') {
      const response = await unifiedClient.completeServiceRequest(updatedTicket.dbId, {
        customerSignerName: updatedTicket.customerSignerName || user?.name || null,
        rating: updatedTicket.rating ?? null,
        feedbackNotes: updatedTicket.feedbackNotes || null
      });
      const saved = response.data;
      finalTicket = {
        ...updatedTicket,
        status: 'Completed',
        dbStatus: saved.status,
        currentStepIndex: 1,
        isCompleted: true,
        awaitingCustomerSignature: false,
        serviceReport: updatedTicket.serviceReport
          ? { ...updatedTicket.serviceReport, customerSigned: true, customerSignerName: updatedTicket.customerSignerName }
          : updatedTicket.serviceReport,
        rating: saved.rating,
        feedbackNotes: saved.feedback_notes,
        actualCompletionDate: saved.actual_completion_date
      };
    }

    setTickets(prev => {
      const isSame = (a, b) => (a || '').toString().replace(/^#/, '').toLowerCase().trim() === (b || '').toString().replace(/^#/, '').toLowerCase().trim();
      const targetId = finalTicket.id || finalTicket.ticketNumber;
      let found = false;
      const updatedList = prev.map(t => {
        if (isSame(t.id || t.ticketNumber, targetId)) {
          found = true;
          return { ...t, ...finalTicket };
        }
        return t;
      });

      if (!found) {
        updatedList.unshift(finalTicket);
      }

      return updatedList;
    });

    setSelectedTicket(finalTicket);
    return finalTicket;
  };

  // =========================================================
  // QR CODE SCAN SUCCESS
  // =========================================================

  const handleQrScanSuccess = (roomId) => {
    setShowQrModal(false);
    // Scanning a room QR is always an AV context — EPABX has no room.
    handleOpenWizard(roomId, 'AV');
  };


  // =========================================================
  // RENDER SCREEN
  // =========================================================

  const renderScreen = () => {
    if (currentScreen === 'restoring') {
      return <SkeletonLoader />;
    }

    if (loadingData) {
      return <SkeletonLoader />;
    }

    switch (currentScreen) {
      case 'reset':
        return (
          <ResetPasswordScreen
            token={activationToken}
            onComplete={() => {
              window.history.pushState({}, '', import.meta.env.BASE_URL);
              setCurrentScreen('login');
            }}
          />
        );

      case 'activate':
        return (
          <ActivateAccountScreen
            token={activationToken}
            onComplete={() => {
              window.history.pushState({}, '', import.meta.env.BASE_URL);
              setCurrentScreen('login');
            }}
          />
        );

      case 'splash':
        return (
          <SplashScreen
            onStart={() => setCurrentScreen('login')}
          />
        );

      case 'login':
        return (
          <LoginScreen
            onLogin={(userData) => {
              setUser(userData);
              setCurrentScreen('home');
              setActiveTab('home');
            }}
          />
        );

      case 'home':
        return (
          <HomeScreen
            user={user}
            activeTicket={activeTicket}
            onBookService={(type) => handleOpenWizard(null, type)}
            onViewTicket={(ticket) => {
              setSelectedTicket(ticket);
              setCurrentScreen('tracking');
            }}
            onViewAllRequests={() => handleTabChange('requests')}
            onViewHistory={() => handleTabChange('requests')}
            onOpenQrScanner={() => setShowQrModal(true)}
          />
        );

      case 'wizard':
        return (
          <BookServiceWizard
            initialRoomId={wizardPreselectedRoomId}
            serviceType={wizardServiceType}
            locations={locations}
            rooms={rooms}
            onComplete={handleWizardComplete}
            onCancel={() => {
              setCurrentScreen('home');
              setActiveTab('home');
            }}
          />
        );

      case 'success':
        return (
          <SuccessScreen
            ticket={selectedTicket}
            onTrackRequest={() => setCurrentScreen('tracking')}
            onBackHome={() => {
              setCurrentScreen('home');
              setActiveTab('home');
            }}
          />
        );

      case 'tracking':
        return (
          <RequestTrackingScreen
            ticket={selectedTicket || activeTicket}
            user={user}
            onBack={() => {
              setCurrentScreen('home');
              setActiveTab('home');
            }}
            onUpdateTicket={handleUpdateTicket}
          />
        );

      case 'requests':
        return (
          <MyRequestsScreen
            tickets={tickets}
            onSelectTicket={(ticket) => {
              setSelectedTicket(ticket);
              setCurrentScreen('tracking');
            }}
            onUpdateTicket={handleUpdateTicket}
          />
        );

      case 'notifications':
        return (
          <NotificationsScreen
            notifications={notifications}
            onSelectTicket={(notificationTicket) => {
              const isSame = (a, b) => (a || '').toString().replace(/^#/, '').toLowerCase().trim() === (b || '').toString().replace(/^#/, '').toLowerCase().trim();
              const targetId = notificationTicket?.id || notificationTicket?.ticketNumber;
              const matchedTicket = tickets.find(
                (ticket) => isSame(ticket.id || ticket.ticketNumber, targetId)
              );

              setSelectedTicket(matchedTicket || tickets[0] || null);
              setCurrentScreen('tracking');
            }}
            onMarkAllRead={() => {
              setNotifications((previousNotifications) =>
                previousNotifications.map((notification) => ({
                  ...notification,
                  unread: false
                }))
              );
            }}
            onSimulatePushAlert={() => {
              const title = 'Ravi Kumar (AV Engineer)';
              const message = 'Technician is en route to Bengaluru HQ. ETA: 15 Mins.';
              sendWebPushNotification(title, message);
              setActiveToast({ title, message });

              const newNotification = {
                id: `notif-${Date.now()}`,
                title: 'Technician En Route (Web Push & SMS)',
                message,
                time: 'Just Now',
                unread: true,
                ticketId: activeTicket?.id || 'TT-10482'
              };
              setNotifications((prev) => [newNotification, ...prev]);
            }}
          />
        );

      case 'profile':
        return (
          <ProfileScreen
            user={user}
            isDarkMode={isDarkMode}
            setIsDarkMode={setIsDarkMode}
            onSwitchUser={(switchedUser) => {
              setUser(switchedUser);
              setActiveToast({
                title: 'User Profile Switched',
                message: `Active user set to ${switchedUser.name} (${switchedUser.role}). Accessing ABC Technologies shared tickets.`
              });
            }}
            onLogout={() => {
              unifiedClient.clearTokens();
              setUser(null);
              setTickets([]);
              setCurrentScreen('login');
            }}
          />
        );

      default:
        return null;
    }
  };


  const unreadNotifCount = notifications.filter(
    (notification) => notification.unread
  ).length;

  const isAuthOrSplash =
    currentScreen === 'splash' ||
    currentScreen === 'login' || currentScreen === 'reset' ||
    currentScreen === 'activate';


  return (
    <div
      className={`app-container-wrapper ${
        isDarkMode ? 'dark-theme' : ''
      }`}
    >
      {/* Phone Chassis Mockup */}
      <div
        className={`phone-chassis ${
          isFullViewport ? 'full-viewport' : ''
        }`}
      >
        {/* Animated Real-time Push & SMS Notification Toast */}
        <NotificationToast
          toast={activeToast}
          onClose={() => setActiveToast(null)}
          onClick={() => {
            if (activeToast?.ticketId) {
              const t = tickets.find((tk) => tk.id === activeToast.ticketId);
              if (t) setSelectedTicket(t);
              setCurrentScreen('tracking');
              setActiveToast(null);
            }
          }}
        />

        {/* Global App Header */}
        {!isAuthOrSplash &&
          currentScreen !== 'wizard' &&
          currentScreen !== 'success' && (
            <Header
              title={
                currentScreen === 'home'
                  ? 'TaskTel'
                  : currentScreen === 'tracking' ? `Ticket ${((typeof selectedTicket === 'object' ? (selectedTicket?.id || selectedTicket?.ticketNumber) : selectedTicket) || 'TT-10482').toString().replace(/^#/, '')}`
                  : currentScreen === 'requests'
                  ? 'My Requests'
                  : currentScreen === 'notifications'
                  ? 'Notifications'
                  : currentScreen === 'profile'
                  ? 'Customer Profile'
                  : 'TaskTel'
              }
              subtitle={currentScreen === 'home' ? APP_COMPANY_NAME : null}
              showBack={
                currentScreen === 'tracking' ||
                currentScreen === 'notifications'
              }
              onBack={() => {
                setCurrentScreen('home');
                setActiveTab('home');
              }}
              unreadCount={unreadNotifCount}
              onOpenNotifications={() =>
                setCurrentScreen('notifications')
              }
              onOpenQrScanner={() => setShowQrModal(true)}
            />
          )}

        {/* Dynamic Screen View */}
        <main className="app-screen-body">
          {renderScreen()}
        </main>

        {/* Bottom Navigation */}
        {!isAuthOrSplash && currentScreen !== 'wizard' && (
          <BottomNav
            activeTab={activeTab}
            setActiveTab={handleTabChange}
          />
        )}

        {/* Modals */}
        {showQrModal && (
          <QRScannerModal
            onClose={() => setShowQrModal(false)}
            onScanRoomSuccess={handleQrScanSuccess}
          />
        )}

        {showCompletionModal && (
          <ServiceCompletionModal
            ticket={selectedTicket || activeTicket}
            onConfirmResolved={() => {
              setShowCompletionModal(false);
              setShowFeedbackModal(true);
            }}
            onRejectResolution={() => {
              setShowCompletionModal(false);
              alert(
                'Re-opening ticket. Support desk notified.'
              );
            }}
          />
        )}

        {showFeedbackModal && (
          <FeedbackModal
            ticket={selectedTicket || activeTicket}
            onSubmitFeedback={() => {
              setShowFeedbackModal(false);
              setCurrentScreen('home');
              setActiveTab('home');
            }}
            onClose={() => setShowFeedbackModal(false)}
          />
        )}
      </div>
    </div>
  );
}

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Customer App Error Boundary caught:', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReset = () => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch (e) {}
    window.location.href = import.meta.env.BASE_URL;
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ backgroundColor: '#0B132B', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ backgroundColor: '#1C2541', padding: '28px 24px', borderRadius: '16px', border: '1px solid #3A506B', textAlign: 'center', maxWidth: '420px', color: '#FFF', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.4)' }}>
            <div style={{ fontSize: '38px', marginBottom: '10px' }}>📱</div>
            <h2 style={{ fontSize: '18px', fontWeight: '800', marginBottom: '8px', color: '#60A5FA' }}>TaskTel App Recovered</h2>
            <p style={{ fontSize: '12px', color: '#94A3B8', marginBottom: '16px', lineHeight: '1.5' }}>
              An unexpected UI state was encountered. Tap below to reload your dashboard cleanly.
            </p>

            {this.state.error && (
              <div style={{ background: '#0F172A', padding: '10px 12px', borderRadius: '8px', border: '1px solid #334155', fontSize: '11px', color: '#F87171', fontFamily: 'monospace', textAlign: 'left', marginBottom: '18px', maxHeight: '80px', overflowY: 'auto', wordBreak: 'break-word' }}>
                {this.state.error.toString()}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button
                onClick={() => {
                  this.setState({ hasError: false, error: null, errorInfo: null });
                  window.location.reload();
                }}
                style={{ backgroundColor: '#004898', color: '#FFF', padding: '12px', borderRadius: '10px', border: 'none', fontWeight: '800', fontSize: '13px', cursor: 'pointer' }}
              >
                🔄 Refresh Dashboard
              </button>

              <button
                onClick={this.handleReset}
                style={{ backgroundColor: 'transparent', color: '#94A3B8', padding: '8px', borderRadius: '8px', border: '1px solid #334155', fontWeight: '700', fontSize: '11px', cursor: 'pointer' }}
              >
                🧹 Reset Cache & Return Home
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function RootApp() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}
