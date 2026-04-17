import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { BookOpen, ChevronLeft, ChevronRight, ExternalLink, Send, Sparkles } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { studentAPI } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';

interface Recommendation {
  chapterId: string;
  chapterName: string;
  school?: string;
  tags: string[];
  memberCount: number;
  registrationOpen: boolean;
  reasons: string[];
}

interface BotMessage {
  role: 'assistant' | 'user';
  content: string;
}

const RecommendationsWidget: React.FC = () => {
  const { user, isAuthenticated } = useAuth();
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [botMessages, setBotMessages] = useState<BotMessage[]>([
    {
      role: 'assistant',
      content: 'Ask me what kind of chapter you want and I will recommend options using the chapter school and tags stored in DynamoDB.'
    }
  ]);
  const [botInput, setBotInput] = useState('');
  const [isBotLoading, setIsBotLoading] = useState(false);

  const recommendationSummary = useMemo(() => {
    if (recommendations.length === 0) return '';
    return recommendations
      .slice(0, 3)
      .map((chapter) => `${chapter.chapterName} (${chapter.school || 'No school'})`)
      .join(', ');
  }, [recommendations]);

  useEffect(() => {
    if (!isAuthenticated || user?.activeRole !== 'student') return;

    let isMounted = true;

    const loadRecommendations = async () => {
      setIsLoading(true);
      try {
        const response = await studentAPI.getRecommendedChapters();
        if (isMounted) {
          setRecommendations(response.recommendations || []);
        }
      } catch (error) {
        console.error('Failed to load recommendations:', error);
        if (isMounted) {
          setRecommendations([]);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadRecommendations();
    const intervalId = window.setInterval(loadRecommendations, 45000);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
  }, [isAuthenticated, user?.activeRole]);

  useEffect(() => {
    if (!recommendationSummary) return;

    setBotMessages((prev) => {
      const hasSummary = prev.some((msg) => msg.role === 'assistant' && msg.content.includes('Current top picks:'));
      if (hasSummary) return prev;
      return [
        ...prev,
        {
          role: 'assistant',
          content: `Current top picks: ${recommendationSummary}. You can ask why these fit you, or ask for chapters by school, topic, or tag.`
        }
      ];
    });
  }, [recommendationSummary]);

  if (!isAuthenticated || user?.activeRole !== 'student') return null;

  const hiddenOnProfile = location.pathname.includes('/messages');

  const handleAskBot = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = botInput.trim();
    if (!trimmed || isBotLoading) return;

    const nextHistory = [...botMessages, { role: 'user' as const, content: trimmed }];
    setBotMessages(nextHistory);
    setBotInput('');
    setIsBotLoading(true);

    try {
      const response = await studentAPI.chatWithRecommendationBot({
        message: trimmed,
        history: nextHistory.map((message) => ({ role: message.role, content: message.content }))
      });

      const assistantReply = response.answer || 'I could not generate a recommendation response right now.';
      setBotMessages((prev) => [...prev, { role: 'assistant', content: assistantReply }]);

      if (Array.isArray(response.recommendations) && response.recommendations.length > 0) {
        setRecommendations(response.recommendations);
      }
    } catch (error) {
      console.error('Failed to chat with recommendation bot:', error);
      setBotMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'I hit a snag while generating chapter advice. Please try again in a moment.'
        }
      ]);
    } finally {
      setIsBotLoading(false);
    }
  };

  return (
    <div className={`fixed left-4 bottom-6 z-40 ${hiddenOnProfile ? 'hidden lg:block' : ''}`}>
      <AnimatePresence initial={false}>
        {isOpen ? (
          <motion.div
            key="recommendations-panel"
            initial={{ opacity: 0, x: -16, scale: 0.96 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -16, scale: 0.96 }}
            className="w-[360px] rounded-3xl border border-sky-100 bg-white/95 backdrop-blur-xl shadow-2xl overflow-hidden"
          >
            <div className="bg-gradient-to-r from-sky-600 to-cyan-500 px-4 py-4 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5" />
                <p className="font-semibold text-sm">Chapter Recommendations</p>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="rounded-full bg-white/15 p-2 hover:bg-white/25 transition-colors"
                aria-label="Collapse recommendations"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[560px] overflow-y-auto p-4 space-y-3 custom-scrollbar">
              {isLoading && recommendations.length === 0 ? (
                <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-8 text-center text-sm text-slate-600">
                  Loading recommendations...
                </div>
              ) : recommendations.length === 0 ? (
                <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-8 text-center">
                  <BookOpen className="h-8 w-8 text-slate-400 mx-auto mb-3" />
                  <p className="text-sm font-medium text-slate-700">Explore chapters</p>
                  <p className="text-xs text-slate-500 mt-1">Ask about chapters by school, topic, or interest.</p>
                </div>
              ) : (
                recommendations.map((chapter) => (
                  <div key={chapter.chapterId} className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-900">{chapter.chapterName}</p>
                        <p className="text-xs text-slate-500 mt-1">{chapter.school || 'School not tagged yet'}</p>
                      </div>
                      <span
                        className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${
                          chapter.registrationOpen ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        {chapter.registrationOpen ? 'Open' : 'Closed'}
                      </span>
                    </div>

                    {chapter.tags.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-3">
                        {chapter.tags.slice(0, 3).map((tag) => (
                          <span key={tag} className="rounded-full bg-sky-100 px-2.5 py-1 text-[10px] font-medium text-sky-700">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="mt-3 space-y-1">
                      {chapter.reasons.slice(0, 2).map((reason) => (
                        <p key={reason} className="text-xs text-slate-600">
                          {reason}
                        </p>
                      ))}
                    </div>

                    <div className="mt-4 flex items-center justify-between">
                      <span className="text-xs text-slate-500">{chapter.memberCount} members</span>
                      <Link
                        to={`/student/chapters/${chapter.chapterId}/about`}
                        className="inline-flex items-center gap-1 text-sm font-semibold text-sky-700 hover:text-sky-800"
                      >
                        View
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  </div>
                ))
              )}

              <div className="rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
                <div className="space-y-3 max-h-[220px] overflow-y-auto pr-1 custom-scrollbar">
                  {botMessages.map((message, index) => (
                    <div
                      key={`${message.role}-${index}`}
                      className={`rounded-2xl px-3 py-2 text-sm ${
                        message.role === 'assistant'
                          ? 'bg-slate-100 text-slate-700'
                          : 'bg-sky-600 text-white'
                      }`}
                    >
                      {message.content}
                    </div>
                  ))}
                  {isBotLoading && (
                    <div className="rounded-2xl bg-slate-100 px-3 py-2 text-sm text-slate-600">
                      Thinking about the best chapters for you...
                    </div>
                  )}
                </div>

                <form onSubmit={handleAskBot} className="mt-3 flex gap-2">
                  <input
                    type="text"
                    value={botInput}
                    onChange={(e) => setBotInput(e.target.value)}
                    placeholder="Ask for chapters by school, tag, or interest"
                    className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-sky-500"
                  />
                  <button
                    type="submit"
                    disabled={isBotLoading || !botInput.trim()}
                    className="inline-flex items-center justify-center rounded-xl bg-sky-600 px-3 text-white hover:bg-sky-700 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </form>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.button
            key="recommendations-toggle"
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            onClick={() => setIsOpen(true)}
            className="rounded-full bg-gradient-to-r from-sky-600 to-cyan-500 p-4 text-white shadow-xl hover:shadow-2xl transition-shadow"
            aria-label="Open recommendations"
          >
            <ChevronRight className="h-5 w-5" />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
};

export default RecommendationsWidget;
