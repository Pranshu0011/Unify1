import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Users, Calendar, Settings, TrendingUp, Plus, Eye, RefreshCw, AlertCircle, Clock, MessageSquare, Megaphone, Activity, ArrowRight, Tags } from 'lucide-react';
import { motion } from 'framer-motion';
import { useAuth } from '../../contexts/AuthContext';
import { useChapterHead } from '../../contexts/ChapterHeadContext';
import { useChat } from '../../contexts/ChatContext';
import ConversationsList from '../chat/ConversationsList';
import Loader from '../common/Loader';
import { formatDistanceToNow } from 'date-fns';
import { chapterHeadAPI } from '../../services/chapterHeadApi';
import PaymentStatsModal from '../admin/PaymentStatsModal';
import { useTheme } from '../../contexts/ThemeContext';

// Define a specific type for the colors to ensure type safety
type StatColor = 'blue' | 'green' | 'purple' | 'orange';

const HeadDashboard: React.FC = () => {
  const { user } = useAuth();
  const { isDark } = useTheme();
  const navigate = useNavigate();
  const { 
    profile,
    chapters,
    dashboardStats,
    recentActivities,
    isLoading,
    error,
    refreshData
  } = useChapterHead();
  const { setActiveChapterId, refreshConversations } = useChat();
  const [managedEvents, setManagedEvents] = useState<any[]>([]);

  const getChapterId = (chapter: any): string =>
    chapter?.chapterId || chapter?.chapterID || chapter?.id || '';
  const isNonEmptyString = (value: unknown): value is string =>
    typeof value === 'string' && value.trim().length > 0;

  const chapterList = useMemo(() => (Array.isArray(chapters) ? chapters : []), [chapters]);
  const activityList = useMemo(() => (Array.isArray(recentActivities) ? recentActivities : []), [recentActivities]);
  const headChapterIds = useMemo<string[]>(
    () =>
      Array.from(
        new Set(
          [profile?.chapterId, profile?.chapterID, ...chapterList.map((ch) => getChapterId(ch))].filter(isNonEmptyString)
        )
      ),
    [profile?.chapterId, profile?.chapterID, chapterList]
  );

  useEffect(() => {
    if (user?.activeRole === 'chapter-head') {
      refreshData();
    }
  }, [user?.activeRole]);

  useEffect(() => {
    const defaultChapterId = headChapterIds.length > 0 ? headChapterIds[0] : null;

    if (defaultChapterId) {
      setActiveChapterId(defaultChapterId);
      refreshConversations(headChapterIds);
    }
  }, [headChapterIds, setActiveChapterId, refreshConversations]);

  useEffect(() => {
    const loadManagedEvents = async () => {
      try {
        const chapterIds: string[] = Array.from(new Set(chapterList.map((ch) => getChapterId(ch)).filter(isNonEmptyString)));
        if (chapterIds.length === 0) {
          setManagedEvents([]);
          return;
        }

        const responses = await Promise.all(
          chapterIds.map((chapterId) => chapterHeadAPI.getMyEvents(chapterId).catch(() => ({ events: [] })))
        );

        const mergedEvents = responses.flatMap((res: any) => res?.events || []);
        setManagedEvents(mergedEvents);
      } catch (err) {
        console.warn('Failed to load managed events for announcements', err);
      }
    };

    loadManagedEvents();
  }, [chapterList]);

  const stats: { icon: React.ElementType; label: string; value: number; color: StatColor; link: string }[] = [
    {
      icon: Users,
      label: 'My Chapters',
      value: dashboardStats?.totalChapters || 0,
      color: 'blue',
      link: '/head/chapters'
    },
    {
      icon: Calendar,
      label: 'Active Events',
      value: dashboardStats?.activeEvents || 0,
      color: 'green',
      link: '/head/events/manage'
    },
    {
      icon: TrendingUp,
      label: 'Total Members',
      value: dashboardStats?.totalMembers || 0,
      color: 'purple',
      link: '/head/registrations'
    },
    {
      icon: Settings,
      label: 'Pending Requests',
      value: dashboardStats?.pendingRegistrations || 0,
      color: 'orange',
      link: '/head/registrations'
    }
  ];

  // Use a Record to map the StatColor type to string class names
  const colorClasses: Record<StatColor, string> = {
    blue: 'bg-blue-500',
    green: 'bg-green-500',
    purple: 'bg-purple-500',
    orange: 'bg-orange-500'
  };

  // Remove static activities since we're using real data from context
  const announcements = useMemo(() => {
    const chapterIdSet = new Set(chapterList.map((ch) => getChapterId(ch)).filter(Boolean));

    return (managedEvents || [])
      .filter((event: any) => chapterIdSet.size === 0 || chapterIdSet.has(event.chapterId))
      .flatMap((event: any) => {
        const list = Array.isArray(event.announcements) ? event.announcements : [];
        return list.map((announcement: any, index: number) => ({
          id: `${event.eventId || event.id}-announcement-${index}`,
          message: announcement?.message || '',
          timestamp: announcement?.timestamp || event.updatedAt || event.createdAt,
          chapterName: event.chapterName || event.chapterId || 'Chapter',
          eventName: event.title || event.eventId || event.id || 'Event'
        }));
      })
      .filter((item: any) => item.message)
      .sort((a: any, b: any) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime());
  }, [managedEvents, chapterList]);

  if (isLoading && !dashboardStats) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${isDark ? 'bg-dark-bg' : 'bg-gradient-to-br from-blue-50 via-white to-purple-50'}`}>
        <Loader />
      </div>
    );
  }

  return (
    <div className={`min-h-screen transition-colors duration-300 ${isDark ? 'bg-dark-bg' : 'bg-gradient-to-br from-blue-50 via-white to-purple-50'}`}>
      <div className="w-full px-4 sm:px-6 lg:px-8 py-8">
        {/* Error Display */}
        {error && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6"
          >
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center">
              <AlertCircle className="h-5 w-5 text-red-600 mr-3" />
              <div className="flex-1">
                <p className="text-red-800">{error}</p>
              </div>
              <button
                onClick={refreshData}
                className="ml-3 text-red-600 hover:text-red-700"
                disabled={isLoading}
              >
                <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </motion.div>
        )}

        {/* Welcome Section */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Welcome, {user?.name}! 
          </h1>
          <p className="text-gray-600">
            {profile?.chapterName ? `Managing ${profile.chapterName} chapter` : 'Manage your chapter, events, and student registrations from your dashboard.'}
          </p>
        </motion.div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {stats.map((stat, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
            >
              <Link
                to={stat.link}
                className="block bg-white/80 backdrop-blur-md rounded-xl p-6 border border-white/20 hover:shadow-lg hover:bg-white/90 transition-all duration-200 group"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600 mb-1">{stat.label}</p>
                    <p className="text-3xl font-bold text-gray-900">{stat.value}</p>
                  </div>
                  <div className={`p-3 rounded-lg ${colorClasses[stat.color]} group-hover:scale-110 transition-transform duration-200`}>
                    <stat.icon className="h-6 w-6 text-white" />
                  </div>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
          <div className="p-6 rounded-2xl shadow-lg border transition-all duration-300 backdrop-blur-md bg-white/40 border-white/20">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-gray-800">Quick Actions</h2>
              <Activity className="h-5 w-5 text-gray-500" />
            </div>
            <div className="space-y-3 max-h-[300px] overflow-y-auto overflow-x-hidden pr-2 custom-scrollbar">
               <motion.div whileHover={{ scale: 1.03, x: 5 }} transition={{ type: 'spring', stiffness: 300 }}>
                 <Link to="/head/events/create" className="flex items-center justify-between p-3 rounded-xl hover:bg-white/50 transition-colors group">
                   <div className="flex items-center space-x-4">
                     <div className="p-3 rounded-lg bg-green-100/70">
                         <Plus className="h-5 w-5 text-green-600" />
                     </div>
                     <div>
                       <p className="font-semibold text-gray-900">Create Event</p>
                       <p className="text-sm text-gray-600">Post a new event for students</p>
                     </div>
                   </div>
                   <ArrowRight className="h-5 w-5 text-gray-400 group-hover:text-green-600 transition-colors" />
                 </Link>
               </motion.div>
               
               <motion.div whileHover={{ scale: 1.03, x: 5 }} transition={{ type: 'spring', stiffness: 300 }}>
                 <Link to="/head/events/manage" className="flex items-center justify-between p-3 rounded-xl hover:bg-white/50 transition-colors group">
                   <div className="flex items-center space-x-4">
                     <div className="p-3 rounded-lg bg-orange-100/70">
                         <Plus className="h-5 w-5 text-orange-600" />
                     </div>
                     <div>
                       <p className="font-semibold text-gray-900">Manage Events</p>
                       <p className="text-sm text-gray-600">Edit or delete existing events</p>
                     </div>
                   </div>
                   <ArrowRight className="h-5 w-5 text-gray-400 group-hover:text-orange-600 transition-colors" />
                 </Link>
               </motion.div>
               
               <motion.div whileHover={{ scale: 1.03, x: 5 }} transition={{ type: 'spring', stiffness: 300 }}>
                 <Link to="/head/chapters" className="flex items-center justify-between p-3 rounded-xl hover:bg-white/50 transition-colors group">
                   <div className="flex items-center space-x-4">
                     <div className="p-3 rounded-lg bg-blue-100/70">
                         <Settings className="h-5 w-5 text-blue-600" />
                     </div>
                     <div>
                       <p className="font-semibold text-gray-900">Manage Chapters</p>
                       <p className="text-sm text-gray-600">Open/close registrations</p>
                     </div>
                   </div>
                   <ArrowRight className="h-5 w-5 text-gray-400 group-hover:text-blue-600 transition-colors" />
                 </Link>
               </motion.div>
               
               <motion.div whileHover={{ scale: 1.03, x: 5 }} transition={{ type: 'spring', stiffness: 300 }}>
                 <Link to="/head/registrations" className="flex items-center justify-between p-3 rounded-xl hover:bg-white/50 transition-colors group">
                   <div className="flex items-center space-x-4">
                     <div className="p-3 rounded-lg bg-purple-100/70">
                         <Eye className="h-5 w-5 text-purple-600" />
                     </div>
                     <div>
                       <p className="font-semibold text-gray-900">View Registrations</p>
                       <p className="text-sm text-gray-600">See who has registered</p>
                     </div>
                   </div>
                   <ArrowRight className="h-5 w-5 text-gray-400 group-hover:text-purple-600 transition-colors" />
                 </Link>
               </motion.div>

               <motion.div whileHover={{ scale: 1.03, x: 5 }} transition={{ type: 'spring', stiffness: 300 }}>
                 <Link to="/head/messages" className="flex items-center justify-between p-3 rounded-xl hover:bg-white/50 transition-colors group">
                   <div className="flex items-center space-x-4">
                     <div className="p-3 rounded-lg bg-emerald-100/70">
                         <MessageSquare className="h-5 w-5 text-emerald-600" />
                     </div>
                     <div>
                       <p className="font-semibold text-gray-900">Messaging</p>
                       <p className="text-sm text-gray-600">Open dedicated chat workspace</p>
                     </div>
                   </div>
                   <ArrowRight className="h-5 w-5 text-gray-400 group-hover:text-emerald-600 transition-colors" />
                 </Link>
               </motion.div>

               <motion.div whileHover={{ scale: 1.03, x: 5 }} transition={{ type: 'spring', stiffness: 300 }}>
                 <Link to="/head/chapters/tags" className="flex items-center justify-between p-3 rounded-xl hover:bg-white/50 transition-colors group">
                   <div className="flex items-center space-x-4">
                     <div className="p-3 rounded-lg bg-cyan-100/70">
                         <Tags className="h-5 w-5 text-cyan-600" />
                     </div>
                     <div>
                       <p className="font-semibold text-gray-900">Enter Tags</p>
                       <p className="text-sm text-gray-600">Set school and recommendation tags</p>
                     </div>
                   </div>
                   <ArrowRight className="h-5 w-5 text-gray-400 group-hover:text-cyan-600 transition-colors" />
                 </Link>
               </motion.div>

               <motion.div whileHover={{ scale: 1.03, x: 5 }} transition={{ type: 'spring', stiffness: 300 }}>
                 <button
                   onClick={() => {
                     const chId = profile?.chapterId || (headChapterIds.length > 0 ? headChapterIds[0] : null);
                     if (chId) {
                       navigate(`/head/chapter/${chId}/stats`);
                     }
                   }}
                   className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-white/50 transition-colors group text-left"
                 >
                   <div className="flex items-center space-x-4">
                     <div className="p-3 rounded-lg bg-indigo-100/70">
                         <TrendingUp className="h-5 w-5 text-indigo-600" />
                     </div>
                     <div>
                       <p className="font-semibold text-gray-900">Payment Stats</p>
                       <p className="text-sm text-gray-600">View real-time financial transparency</p>
                     </div>
                   </div>
                   <ArrowRight className="h-5 w-5 text-gray-400 group-hover:text-indigo-600 transition-colors" />
                 </button>
               </motion.div>
            </div>
          </div>

          <div className="bg-white/80 backdrop-blur-md rounded-xl p-6 border border-white/20">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900">Announcements</h2>
              <Megaphone className="h-5 w-5 text-gray-500" />
            </div>
            <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
              {announcements.length > 0 ? (
                announcements.map((item: any) => (
                  <div key={item.id} className="p-3 rounded-lg border border-gray-100 bg-gray-50/80">
                    <p className="font-medium text-gray-900 text-sm">{item.message}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {item.timestamp
                        ? `${new Date(item.timestamp).toLocaleDateString()} • ${new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                        : 'Just now'}
                    </p>
                    <p className="text-xs text-gray-600 mt-2">
                      Chapter: <span className="font-medium">{item.chapterName}</span> | Event: <span className="font-medium">{item.eventName}</span>
                    </p>
                  </div>
                ))
              ) : (
                <div className="text-center py-8">
                  <Megaphone className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">No announcements yet</p>
                </div>
              )}
            </div>
          </div>

          <div className="bg-white/80 backdrop-blur-md rounded-xl p-6 border border-white/20">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Recent Activity</h2>
            <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
              {activityList.map((activity, index) => (
                <motion.div 
                  key={activity.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className="flex items-start space-x-3 p-3 bg-gray-50/80 backdrop-blur-sm rounded-lg hover:bg-gray-100/80 transition-colors"
                >
                  <div className={`w-2 h-2 rounded-full mt-2 ${
                    activity.type === 'registration' ? 'bg-blue-500' :
                    activity.type === 'event' ? 'bg-green-500' : 'bg-purple-500'
                  }`}></div>
                  <div className="flex-1">
                    <p className="font-medium text-gray-900 text-sm">{activity.message}</p>
                    <div className="flex items-center text-xs text-gray-500 mt-1">
                      <Clock className="h-3 w-3 mr-1" />
                      {formatDistanceToNow(new Date(activity.timestamp), { addSuffix: true })}
                    </div>
                  </div>
                </motion.div>
              ))}
              
              {activityList.length === 0 && (
                <div className="text-center py-8">
                  <Calendar className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">No recent activity</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Recent Messages + My Chapters */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-8">
          <ConversationsList chapterIds={headChapterIds} />

          <div className="bg-white/80 backdrop-blur-md rounded-xl p-6 border border-white/20">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-900">My Chapters</h2>
              <Link
                to="/head/chapters"
                className="text-blue-600 hover:text-blue-700 font-medium text-sm"
              >
                View All →
              </Link>
            </div>
            
            {chapterList.length > 0 ? (
              <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                {chapterList.map((chapter, index) => (
                  <motion.div 
                    key={chapter.chapterId || chapter.chapterID || chapter.id || index}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="border border-gray-200/50 bg-white/60 backdrop-blur-sm rounded-lg p-4 hover:shadow-lg hover:bg-white/80 transition-all duration-200"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="font-semibold text-gray-900">{chapter.chapterName || chapter.name}</h3>
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        chapter.registrationStatus === 'open' 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {chapter.registrationStatus === 'open' ? 'Open' : 'Closed'}
                      </span>
                    </div>
                    <div className="text-sm text-gray-600 mb-2">
                      Status: <span className="font-medium capitalize">{chapter.status || 'active'}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span>{chapter.memberCount || 0} members</span>
                      <span>Head: {chapter.headName || user?.name}</span>
                    </div>
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <Users className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500">No chapters assigned</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default HeadDashboard;
