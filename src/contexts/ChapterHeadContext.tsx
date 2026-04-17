import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { chapterHeadAPI } from '../services/chapterHeadApi';
import { useAuth } from './AuthContext';

interface ChapterHeadProfile {
  email: string;
  chapterId: string;
  chapterID?: string; // legacy alias from some API payloads
  chapterld?: string; // typo/legacy alias compatibility
  chapterName: string;
  headName: string;
  linkedAt: string;
}

interface ChapterDetails {
  chapterId: string;
  chapterID?: string; // legacy alias from some API payloads
  chapterld?: string; // typo/legacy alias compatibility
  id?: string; // UI fallback compatibility
  chapterName: string;
  name?: string; // UI fallback compatibility
  createdAt: string;
  headEmail: string;
  headName: string;
  memberCount: number;
  school?: string;
  tags?: string[];
  status: 'active' | 'inactive';
  updatedAt: string;
  registrationStatus?: 'open' | 'closed';
}

interface RegistrationRequest {
  registrationId: string;
  userId: string;
  studentName: string;
  studentEmail: string;
  chapterId: string;
  chapterName: string;
  status: 'pending' | 'approved' | 'rejected';
  appliedAt: string;
  sapId?: string;
  year?: string;
  notes?: string;
}

interface DashboardStats {
  totalChapters: number;
  totalMembers: number;
  pendingRegistrations: number;
  activeEvents: number;
  recentRegistrations: number;
}

interface RecentActivity {
  id: string;
  type: 'registration' | 'event' | 'chapter_update';
  message: string;
  timestamp: string;
  chapterId?: string;
  userId?: string;
}

interface ChapterHeadContextType {
  profile: ChapterHeadProfile | null;
  chapters: ChapterDetails[];
  registrations: RegistrationRequest[];
  dashboardStats: DashboardStats | null;
  recentActivities: RecentActivity[];
  isLoading: boolean;
  error: string | null;
  
  // Actions
  fetchProfile: () => Promise<void>;
  fetchMyChapters: () => Promise<void>;
  fetchRegistrations: (chapterId?: string) => Promise<void>;
  fetchDashboardStats: () => Promise<void>;
  fetchRecentActivities: () => Promise<void>;
  toggleChapterRegistration: (chapterId: string, isOpen: boolean) => Promise<boolean>;
  updateRegistrationStatus: (registrationId: string, status: 'approved' | 'rejected', notes?: string) => Promise<boolean>;
  refreshData: () => Promise<void>;
  createEvent: (eventData: any) => Promise<boolean>;
  updateEvent: (chapterId: string, eventId: string, eventData: any) => Promise<boolean>;
  deleteEvent: (chapterId: string, eventId: string) => Promise<boolean>;
  fetchMyEvents: () => Promise<any[]>;
}

const ChapterHeadContext = createContext<ChapterHeadContextType | undefined>(undefined);

export const useChapterHead = () => {
  const context = useContext(ChapterHeadContext);
  if (!context) {
    throw new Error('useChapterHead must be used within a ChapterHeadProvider');
  }
  return context;
};

interface ChapterHeadProviderProps {
  children: ReactNode;
}

export const ChapterHeadProvider: React.FC<ChapterHeadProviderProps> = ({ children }) => {
  const { user, isAuthenticated } = useAuth();
  const [profile] = useState<ChapterHeadProfile | null>(null);
  const [chapters, setChapters] = useState<ChapterDetails[]>([]);
  const [registrations, setRegistrations] = useState<RegistrationRequest[]>([]);
  const [dashboardStats, setDashboardStats] = useState<DashboardStats | null>(null);
  const [recentActivities, setRecentActivities] = useState<RecentActivity[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-fetch data when user is authenticated as chapter head
  useEffect(() => {
    if (isAuthenticated && user?.activeRole === 'chapter-head') {
      refreshData();
    }
  }, [isAuthenticated, user?.activeRole]);

  const fetchProfile = async () => {
    // Profile fetching temporarily disabled as requested
    console.log('Profile fetching disabled - skipping API call');
    return;
  };

  const fetchMyChapters = async () => {
    if (!isAuthenticated) return;
    
    try {
      const response = await chapterHeadAPI.getMyChapters();
      setChapters(response.chapters || []);
    } catch (error) {
      console.error('Error fetching chapters:', error);
      setError('Failed to fetch chapters');
    }
  };

  const fetchRegistrations = async (chapterId?: string) => {
    if (!isAuthenticated) return;
    
    try {
      const response = await chapterHeadAPI.getChapterRegistrations(chapterId);
      setRegistrations(response.registrations || []);
    } catch (error) {
      console.error('Error fetching registrations:', error);
      setError('Failed to fetch registrations');
    }
  };

  const fetchDashboardStats = async () => {
    if (!isAuthenticated) return;
    
    try {
      const response = await chapterHeadAPI.getDashboardStats();
      setDashboardStats(response.stats);
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
      setError('Failed to fetch dashboard statistics');
    }
  };

  const fetchRecentActivities = async () => {
    if (!isAuthenticated) return;
    
    try {
      const response = await chapterHeadAPI.getRecentActivities();
      setRecentActivities(response.activities || []);
    } catch (error) {
      console.error('Error fetching activities:', error);
      setError('Failed to fetch recent activities');
    }
  };

  const toggleChapterRegistration = async (chapterId: string, isOpen: boolean): Promise<boolean> => {
    try {
      await chapterHeadAPI.toggleChapterRegistration(chapterId, isOpen);
      
      // Update local state
      setChapters(prev => prev.map(chapter => 
        chapter.chapterId === chapterId 
          ? { ...chapter, registrationStatus: isOpen ? 'open' : 'closed' }
          : chapter
      ));
      
      // Refresh stats and activities
      await Promise.all([fetchDashboardStats(), fetchRecentActivities()]);
      return true;
    } catch (error) {
      console.error('Error toggling registration:', error);
      setError('Failed to update registration status');
      return false;
    }
  };

  const updateRegistrationStatus = async (
    registrationId: string, 
    status: 'approved' | 'rejected', 
    notes?: string
  ): Promise<boolean> => {
    try {
      await chapterHeadAPI.updateRegistrationStatus(registrationId, status, notes);
      
      // Update local state
      setRegistrations(prev => prev.map(reg => 
        reg.registrationId === registrationId 
          ? { ...reg, status, notes }
          : reg
      ));
      
      // Refresh stats and activities
      await Promise.all([fetchDashboardStats(), fetchRecentActivities()]);
      return true;
    } catch (error) {
      console.error('Error updating registration status:', error);
      setError('Failed to update registration status');
      return false;
    }
  };

  const createEvent = async (eventData: any): Promise<boolean> => {
    try {
      const sanitizedData = {
        ...eventData,
        registrationFee: eventData.isPaid ? parseFloat(eventData.registrationFee || 0) : 0
      };
      await chapterHeadAPI.createEvent(sanitizedData);
      await Promise.all([fetchDashboardStats(), fetchRecentActivities()]);
      return true;
    } catch (error) {
      console.error('Error creating event:', error);
      setError('Failed to create event');
      return false;
    }
  };

  const updateEvent = async (chapterId: string, eventId: string, eventData: any): Promise<boolean> => {
    try {
      await chapterHeadAPI.updateEvent(chapterId, eventId, eventData);
      await Promise.all([fetchDashboardStats(), fetchRecentActivities()]);
      return true;
    } catch (error) {
      console.error('Error updating event:', error);
      setError('Failed to update event');
      return false;
    }
  };

  const deleteEvent = async (chapterId: string, eventId: string): Promise<boolean> => {
    try {
      await chapterHeadAPI.deleteEvent(chapterId, eventId);
      // Refresh stats and activities
      await Promise.all([fetchDashboardStats(), fetchRecentActivities()]);
      return true;
    } catch (error) {
      console.error('Error deleting event:', error);
      setError('Failed to delete event');
      return false;
    }
  };

  const fetchMyEvents = async (): Promise<any[]> => {
    if (!chapters || chapters.length === 0) return [];
    
    try {
      // Use the first chapter's ID for now, or we could support multiple
      const chapterId = chapters[0].chapterId;
      const response = await chapterHeadAPI.getMyEvents(chapterId);
      return response.events || [];
    } catch (error) {
      console.error('Error fetching my events:', error);
      setError('Failed to fetch events');
      return [];
    }
  };

  const refreshData = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      await Promise.all([
        // fetchProfile(), // Disabled as requested
        fetchMyChapters(),
        fetchRegistrations(),
        fetchDashboardStats(),
        fetchRecentActivities()
      ]);
    } catch (error) {
      console.error('Error refreshing data:', error);
      setError('Failed to refresh data');
    } finally {
      setIsLoading(false);
    }
  };

  const value: ChapterHeadContextType = {
    profile,
    chapters,
    registrations,
    dashboardStats,
    recentActivities,
    isLoading,
    error,
    fetchProfile,
    fetchMyChapters,
    fetchRegistrations,
    fetchDashboardStats,
    fetchRecentActivities,
    toggleChapterRegistration,
    updateRegistrationStatus,
    refreshData,
    createEvent,
    updateEvent,
    deleteEvent,
    fetchMyEvents
  };

  return (
    <ChapterHeadContext.Provider value={value}>
      {children}
    </ChapterHeadContext.Provider>
  );
};
