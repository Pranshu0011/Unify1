import React, { useState } from 'react';
import { Users, Eye, Mail, Calendar, AlertCircle, CheckCircle, RefreshCw, Edit2, BookOpen, ArrowLeft, Tags } from 'lucide-react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useChapterHead } from '../../contexts/ChapterHeadContext';
import Modal from '../common/Modal';
import Loader from '../common/Loader';
import { useTheme } from '../../contexts/ThemeContext';

const ManageChapters: React.FC = () => {
  const navigate = useNavigate();
  const { isDark } = useTheme();
  const { 
    chapters, 
    toggleChapterRegistration, 
    isLoading, 
    error, 
    refreshData 
  } = useChapterHead();
  
  const [selectedChapter, setSelectedChapter] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [notification, setNotification] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const handleToggleRegistration = async (chapterId: string, currentStatus: string) => {
    setUpdating(chapterId);
    try {
      const newStatus = currentStatus === 'open';
      const success = await toggleChapterRegistration(chapterId, !newStatus);
      if (success) {
        setNotification({
          type: 'success',
          message: `Registration ${!newStatus ? 'opened' : 'closed'} successfully`
        });
        setTimeout(() => setNotification(null), 3000);
      } else {
        setNotification({
          type: 'error',
          message: 'Failed to update registration status'
        });
        setTimeout(() => setNotification(null), 3000);
      }
    } catch (error) {
      setNotification({
        type: 'error',
        message: 'An error occurred while updating'
      });
      setTimeout(() => setNotification(null), 3000);
    } finally {
      setUpdating(null);
    }
  };

  const handleEditChapterHead = (chapter: any) => {
    console.log('Edit button clicked for chapter:', chapter.chapterId);
    console.log('Navigating to:', `/head/chapters/edit/${chapter.chapterId}`);
    navigate(`/head/chapters/edit/${chapter.chapterId}`);
  };

  const selectedChapterData = chapters.find(c => c.chapterId === selectedChapter);

  if (isLoading && chapters.length === 0) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${isDark ? 'bg-dark-bg' : 'bg-gradient-to-br from-blue-50 via-white to-purple-50'}`}>
        <Loader />
      </div>
    );
  }

  return (
    <div className={`min-h-screen transition-colors duration-300 ${isDark ? 'bg-dark-bg' : 'bg-gradient-to-br from-blue-50 via-white to-purple-50'}`}>
      <div className="w-full px-4 sm:px-6 lg:px-8 py-8">
        {/* Notification */}
        {notification && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className={`mb-6 p-4 rounded-lg flex items-center ${
              notification.type === 'success'
                ? 'bg-green-50 border border-green-200 text-green-800'
                : 'bg-red-50 border border-red-200 text-red-800'
            }`}
          >
            {notification.type === 'success' ? (
              <CheckCircle className="h-5 w-5 mr-2" />
            ) : (
              <AlertCircle className="h-5 w-5 mr-2" />
            )}
            {notification.message}
          </motion.div>
        )}

        {/* Error Display */}
        {error && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6"
          >
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center justify-between">
              <div className="flex items-center">
                <AlertCircle className="h-5 w-5 text-red-600 mr-3" />
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

        {/* Navigation */}
        <div className="mb-6">
          <button
            onClick={() => navigate('/head/dashboard')}
            className={`group flex items-center text-sm font-medium transition-all duration-200 ${isDark ? 'text-dark-text-secondary hover:text-dark-text-primary' : 'text-slate-600 hover:text-slate-900'}`}
          >
            <div className={`p-2 mr-2 rounded-lg border transition-all ${isDark ? 'bg-dark-surface border-dark-border group-hover:border-accent-500/50 group-hover:bg-accent-600/10' : 'bg-white border-slate-200 group-hover:border-blue-300 group-hover:bg-blue-50'}`}>
              <ArrowLeft className="h-4 w-4 group-hover:-translate-x-1 transition-transform" />
            </div>
            Back to Dashboard
          </button>
        </div>

        {/* Header */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 text-center"
        >
          <h1 className={`text-4xl font-black mb-2 tracking-tight ${isDark ? 'text-dark-text-primary' : 'text-slate-900'}`}>Manage Chapters</h1>
          <p className={`max-w-2xl mx-auto font-medium ${isDark ? 'text-dark-text-secondary' : 'text-slate-600'}`}>
            Control registration status and view chapter details for your assigned chapters.
          </p>
        </motion.div>

        {/* Chapters List */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className={`backdrop-blur-md rounded-xl border overflow-hidden transition-colors duration-300 ${isDark ? 'bg-dark-surface/85 border-dark-border/70' : 'bg-white/80 border-white/20'}`}
        >
          {chapters.length === 0 ? (
            <div className="text-center py-12">
              <Users className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Chapters Assigned</h3>
              <p className="text-gray-500">You don't have any chapters assigned to manage yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50/80">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Chapter
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Members
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Registration
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {chapters.map((chapter, index) => (
                    <motion.tr 
                      key={chapter.chapterId}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.1 }}
                      className="hover:bg-gray-50/50 transition-colors duration-200"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center">
                          <div className="h-10 w-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center mr-3">
                            <span className="text-white font-semibold text-sm">
                              {chapter.chapterName.charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <div>
                            <div className="text-sm font-medium text-gray-900">
                              {chapter.chapterName}
                            </div>
                            <div className="text-sm text-gray-500">
                              Head: {chapter.headName}
                            </div>
                          </div>
                        </div>
                      </td>
                      
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
                          chapter.status === 'active'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {chapter.status}
                        </span>
                      </td>
                      
                      <td className="px-6 py-4 text-sm text-gray-900">
                        <div className="flex items-center">
                          <Users className="h-4 w-4 mr-1 text-gray-400" />
                          {chapter.memberCount}
                        </div>
                      </td>
                      
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
                          chapter.registrationStatus === 'open'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {chapter.registrationStatus === 'open' ? 'Open' : 'Closed'}
                        </span>
                      </td>
                      
                      <td className="px-6 py-4">
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => {
                              setSelectedChapter(chapter.chapterId);
                              setShowDetailsModal(true);
                            }}
                            className="p-2 text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-all duration-200"
                            title="View Details"
                          >
                            <Eye className="h-4 w-4" />
                          </button>

                          <button
                            onClick={() => {
                              navigate(`/head/chapters/profile/${chapter.chapterId}`);
                            }}
                            className="p-2 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg transition-all duration-200"
                            title="Edit Chapter Profile"
                          >
                            <BookOpen className="h-4 w-4" />
                          </button>

                          <button
                            onClick={() => {
                              alert(`Edit clicked for chapter: ${chapter.chapterName}`);
                              handleEditChapterHead(chapter);
                            }}
                            className="p-2 text-green-600 hover:text-green-700 hover:bg-green-50 rounded-lg transition-all duration-200"
                            title="Edit Chapter Head"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>

                          <button
                            onClick={() => navigate('/head/chapters/tags')}
                            className="px-3 py-1 rounded-lg text-xs font-medium transition-all duration-200 bg-cyan-100 text-cyan-800 hover:bg-cyan-200"
                            title="Enter Tags"
                          >
                            <span className="inline-flex items-center gap-1">
                              <Tags className="h-3.5 w-3.5" />
                              Enter Tags
                            </span>
                          </button>

                          <button
                            onClick={() => handleToggleRegistration(chapter.chapterId, chapter.registrationStatus || 'closed')}
                            disabled={updating === chapter.chapterId}
                            className={`px-3 py-1 rounded-lg text-xs font-medium transition-all duration-200 ${
                              chapter.registrationStatus === 'open'
                                ? 'bg-red-100 text-red-800 hover:bg-red-200'
                                : 'bg-green-100 text-green-800 hover:bg-green-200'
                            } ${updating === chapter.chapterId ? 'opacity-50 cursor-not-allowed' : ''}`}
                          >
                            {updating === chapter.chapterId
                              ? 'Updating...'
                              : chapter.registrationStatus === 'open'
                                ? 'Close Registration'
                                : 'Open Registration'
                            }
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </motion.div>

        {/* Chapter Details Modal */}
        <Modal
          isOpen={showDetailsModal}
          onClose={() => {
            setShowDetailsModal(false);
            setSelectedChapter(null);
          }}
          title="Chapter Details"
          size="lg"
        >
          {selectedChapterData && (
            <div className="space-y-6">
              <div className="flex items-center space-x-4">
                <div className="h-16 w-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center">
                  <span className="text-white font-bold text-xl">
                    {selectedChapterData.chapterName.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-900">
                    {selectedChapterData.chapterName}
                  </h3>
                  <p className="text-gray-600">
                    Chapter Head: {selectedChapterData.headName}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <h4 className="font-medium text-gray-900 mb-2">Chapter Information</h4>
                    <div className="space-y-2">
                      <div className="flex items-center text-sm text-gray-700">
                        <Users className="h-4 w-4 mr-2 text-blue-600" />
                        <span>{selectedChapterData.memberCount} members</span>
                      </div>
                      
                      <div className="flex items-center text-sm text-gray-700">
                        <Mail className="h-4 w-4 mr-2 text-blue-600" />
                        <span>{selectedChapterData.headEmail}</span>
                      </div>

                      <div className="flex items-center text-sm text-gray-700">
                        <Calendar className="h-4 w-4 mr-2 text-blue-600" />
                        <span>Status: <span className="font-medium capitalize">{selectedChapterData.status}</span></span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <h4 className="font-medium text-gray-900 mb-2">Registration Status</h4>
                    <div className="flex items-center space-x-2">
                      <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                        selectedChapterData.registrationStatus === 'open'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {selectedChapterData.registrationStatus === 'open' ? 'Open' : 'Closed'}
                      </span>
                    </div>
                  </div>

                  <div>
                    <h4 className="font-medium text-gray-900 mb-2">Chapter ID</h4>
                    <code className="text-sm bg-gray-100 px-2 py-1 rounded font-mono">
                      {selectedChapterData.chapterId}
                    </code>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-gray-200">
                <div className="text-sm text-gray-500">
                  Created: {new Date(selectedChapterData.createdAt).toLocaleDateString()}
                </div>
                <div className="text-sm text-gray-500">
                  Updated: {new Date(selectedChapterData.updatedAt).toLocaleDateString()}
                </div>
              </div>
            </div>
          )}
        </Modal>
      </div>
    </div>
  );
};

export default ManageChapters;
