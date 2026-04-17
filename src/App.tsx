import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate, Outlet, useNavigate } from 'react-router-dom';
import { useAuth, Role } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import Header from './components/common/Header';
import Footer from './components/common/Footer';
import ConfigStatus from './components/common/ConfigStatus';
import StudentPortal from './pages/StudentPortal';
import HeadPortal from './pages/HeadPortal';
import AdminPortal from './pages/AdminPortal';
import AuthPage from './pages/AuthPage';
import Loader from './components/common/Loader';
import { Shield, User, UserCog } from 'lucide-react';
import { ChatProvider } from './contexts/ChatContext';
import ChatWidget from './components/chat/ChatWidget';
import RecommendationsWidget from './components/student/RecommendationsWidget';

// This component will wrap pages that need the Header and Footer
const MainLayout: React.FC = () => (
  <div className="flex flex-col min-h-screen bg-gray-50 dark:bg-dark-bg transition-colors duration-300">
    <header>
      <Header />
    </header>
    <main className="flex-1 bg-gray-50 dark:bg-dark-bg transition-colors duration-300">
      <Outlet /> {/* Child routes will render here */}
    </main>
    <RecommendationsWidget />
    <ChatWidget />
    <footer>
      <Footer />
    </footer>
  </div>
);

const ProtectedRoute: React.FC<{ children: React.ReactNode; allowedRoles: Role[] }> = ({
  children,
  allowedRoles,
}) => {
  const { user, isLoading, isAuthenticated } = useAuth();

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader /></div>;
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/" replace />;
  }
  
  // If user has multiple roles but hasn't selected one, redirect to selection
  // But only if they're accessing the root paths - the role toggle allows switching on the fly
  if (user.groups.length > 1 && !user.activeRole && window.location.pathname === '/') {
    return <Navigate to="/select-role" replace />;
  }

  // If no active role is set, but user has roles, try to set a default
  if (!user.activeRole && user.groups.length > 0) {
    // This will be handled by the role selection or role toggle
    if (user.groups.length === 1) {
      // Auto-set single role
      return <Navigate to="/" replace />;
    }
    return <Navigate to="/select-role" replace />;
  }

  if (!allowedRoles.includes(user.activeRole as Role)) {
    // Fallback logic if they try to access a page they aren't allowed on
    if (user.groups.includes('admin')) return <Navigate to="/admin/dashboard" replace />;
    if (user.groups.includes('chapter-head')) return <Navigate to="/head/dashboard" replace />;
    if (user.groups.includes('student')) return <Navigate to="/student/dashboard" replace />;
    return <Navigate to="/" replace />; 
  }

  return <>{children}</>;
};

// New Component for Role Selection
const RoleSelectionPage: React.FC = () => {
    const { user, setActiveRole } = useAuth();
    const [selectedRole, setSelectedRole] = useState<string | null>(null);
    const navigate = useNavigate();

    const roleDetails: { [key: string]: { icon: React.ElementType, name: string } } = {
        student: { icon: User, name: 'Student' },
        'chapter-head': { icon: Shield, name: 'Chapter Head' },
        admin: { icon: UserCog, name: 'Admin' },
    };

    // This effect will run when the activeRole is set, triggering navigation
    useEffect(() => {
        if (user && user.activeRole) {
            const path = user.activeRole === 'student' ? '/student/dashboard' : user.activeRole === 'chapter-head' ? '/head/dashboard' : '/admin/dashboard';
            navigate(path, { replace: true });
        }
    }, [user, navigate]);


    if (!user || user.groups.length < 2) {
        return <Navigate to="/" replace />;
    }

    const handleProceed = () => {
        if (selectedRole) {
            setActiveRole(selectedRole);
        }
    };

    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 dark:bg-dark-bg p-4 transition-colors duration-300">
            <div className="w-full max-w-md bg-white dark:bg-dark-surface p-8 rounded-2xl shadow-lg dark:shadow-2xl text-center backdrop-blur-md border border-gray-200 dark:border-dark-border">
                <h1 className="text-2xl font-bold text-gray-800 dark:text-dark-text-primary mb-2">Select Your Role</h1>
                <p className="text-gray-500 dark:text-dark-text-secondary mb-8">You have multiple roles. Please choose how you'd like to proceed for this session.</p>
                <div className="space-y-4">
                    {user.groups.map(group => {
                        const details = roleDetails[group] || { icon: User, name: group };
                        const isSelected = selectedRole === group;
                        return (
                            <button
                                key={group}
                                onClick={() => setSelectedRole(group)}
                                className={`w-full flex items-center justify-center gap-3 p-4 border-2 rounded-lg transition-all ${isSelected ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-blue-400'}`}
                            >
                                <details.icon className={`h-6 w-6 ${isSelected ? 'text-blue-600' : 'text-gray-500'}`} />
                                <span className={`text-lg font-semibold ${isSelected ? 'text-blue-800' : 'text-gray-700'}`}>{details.name}</span>
                            </button>
                        );
                    })}
                </div>
                <button
                    onClick={handleProceed}
                    disabled={!selectedRole}
                    className="w-full mt-8 py-3 bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                >
                    Proceed
                </button>
            </div>
        </div>
    );
};


function App() {
  return (
    <ThemeProvider>
      <ChatProvider>
        <AppContent />
      </ChatProvider>
    </ThemeProvider>
  );
}

function AppContent() {
  const { isAuthenticated, user, isLoading } = useAuth();

  const getRedirectPath = (user: { activeRole: string, groups: string[] } | null): string => {
      if (!user) return '/';
      
      // If user has multiple groups but no active role, send to selection page
      if (user.groups.length > 1 && !user.activeRole) {
          return '/select-role';
      }

      // Prioritize the active role
      const role = user.activeRole;
      if (role === 'student') return '/student/dashboard';
      if (role === 'chapter-head') return '/head/dashboard';
      if (role === 'admin') return '/admin/dashboard';

      // Fallback if activeRole is somehow invalid but they have groups
      if (user.groups.includes('admin')) return '/admin/dashboard';
      if (user.groups.includes('chapter-head')) return '/head/dashboard';
      if (user.groups.includes('student')) return '/student/dashboard';
      
      return '/';
  }

  if (isLoading) {
      return <div className="min-h-screen flex items-center justify-center"><Loader /></div>;
  }

  return (
    <>
      <Routes>
        <Route 
          path="/" 
          element={
            isAuthenticated && user ? (
              <Navigate to={getRedirectPath(user)} replace />
            ) : (
              <AuthPage />
              
            )
          } 
        />
        
        {/* Add the new route for role selection */}
        <Route path="/select-role" element={<RoleSelectionPage />} />

        <Route element={<MainLayout />}>
          <Route
            path="/student/*"
            element={
              <ProtectedRoute allowedRoles={['student']}>
                <StudentPortal />
              </ProtectedRoute>
            }
          />
          <Route
            path="/head/*"
            element={
              <ProtectedRoute allowedRoles={['chapter-head', 'admin']}>
                <HeadPortal />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/*"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AdminPortal />
              </ProtectedRoute>
            }
          />
        </Route>

        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
      
      {/* Add ConfigStatus for debugging in development */}
      {import.meta.env.DEV && <ConfigStatus />}
    </>
  );
}

export default App;
