import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle, RefreshCw, Save, Tags } from 'lucide-react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useChapterHead } from '../../contexts/ChapterHeadContext';
import { chapterHeadAPI } from '../../services/chapterHeadApi';

const SCHOOL_OPTIONS = [
  'School of Health Science',
  'School of Computer Science',
  'School of Law',
  'School of Engineering',
  'School of Aerospace',
  'School of Buisness',
  'School of Management',
];

const parseTags = (value: string) =>
  Array.from(
    new Set(
      value
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean)
    )
  );

const ChapterTagManager: React.FC = () => {
  const navigate = useNavigate();
  const { chapters, refreshData, isLoading } = useChapterHead();
  const [selectedChapterId, setSelectedChapterId] = useState('');
  const [school, setSchool] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const chapterOptions = useMemo(() => chapters || [], [chapters]);
  const selectedChapter = useMemo(
    () => chapterOptions.find((chapter) => chapter.chapterId === selectedChapterId) || null,
    [chapterOptions, selectedChapterId]
  );

  useEffect(() => {
    if (!selectedChapterId && chapterOptions.length > 0) {
      setSelectedChapterId(chapterOptions[0].chapterId);
    }
  }, [chapterOptions, selectedChapterId]);

  useEffect(() => {
    if (!selectedChapter) return;
    setSchool(selectedChapter.school || '');
    setTagsInput((selectedChapter.tags || []).join(', '));
  }, [selectedChapter]);

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!selectedChapterId) {
      setFeedback({ type: 'error', message: 'Please choose a chapter first.' });
      return;
    }

    if (!school) {
      setFeedback({ type: 'error', message: 'Please select a school for the chapter.' });
      return;
    }

    const tags = parseTags(tagsInput);
    if (tags.length === 0) {
      setFeedback({ type: 'error', message: 'Please add at least one tag.' });
      return;
    }

    setIsSaving(true);
    setFeedback(null);

    try {
      await chapterHeadAPI.updateChapterTags(selectedChapterId, { school, tags });
      await refreshData();
      setFeedback({ type: 'success', message: 'Chapter tags saved successfully.' });
    } catch (error: any) {
      setFeedback({ type: 'error', message: error?.message || 'Unable to save chapter metadata.' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[linear-gradient(135deg,#f8fbff_0%,#fffdf5_45%,#eef6ff_100%)]">
      <div className="w-full px-3 sm:px-4 lg:px-5 py-8 lg:py-10">
        <div className="mb-6">
          <button
            onClick={() => navigate('/head/dashboard')}
            className="group flex items-center text-sm font-medium text-slate-600 hover:text-slate-900 transition-all duration-200"
          >
            <div className="p-2 mr-2 bg-white rounded-lg border border-slate-200 group-hover:border-blue-300 group-hover:bg-blue-50 transition-all">
              <ArrowLeft className="h-4 w-4 group-hover:-translate-x-1 transition-transform" />
            </div>
            Back to Dashboard
          </button>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full flex justify-center"
        >
          <div className="w-full max-w-[1180px]">
            {feedback && (
              <div
                className={`mb-6 rounded-2xl border px-4 py-3 flex items-center gap-3 ${
                  feedback.type === 'success'
                    ? 'bg-green-50 border-green-200 text-green-800'
                    : 'bg-red-50 border-red-200 text-red-800'
                }`}
              >
                <CheckCircle className="h-5 w-5" />
                <span>{feedback.message}</span>
              </div>
            )}

            <div className="rounded-[28px] border border-white/60 bg-white/85 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur-xl overflow-hidden">
              <div className="grid lg:grid-cols-[1.12fr_1.88fr]">
                <div className="relative overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(37,99,235,0.18),_transparent_55%),linear-gradient(180deg,#eff6ff_0%,#f8fafc_72%,#fff7ed_100%)] p-6 sm:p-8 lg:p-10">
                  <div className="absolute inset-y-0 right-0 hidden lg:flex items-center">
                    <div className="h-[86%] w-[18px] rounded-l-full bg-gradient-to-b from-amber-200 via-yellow-400 to-amber-500 shadow-[0_0_26px_rgba(245,158,11,0.32)]"></div>
                  </div>
                  <div className="max-w-md pr-2 lg:pr-10">
                    <div className="inline-flex items-center gap-3 rounded-2xl border border-blue-200/80 bg-white/80 px-4 py-3 shadow-sm">
                      <div className="p-3 rounded-xl bg-blue-100 text-blue-700">
                        <Tags className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-700">Unify Metadata</p>
                        <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">Enter Tags</h1>
                      </div>
                    </div>

                    <p className="mt-6 text-sm sm:text-base leading-7 text-slate-600 font-medium">
                      Add the chapter&apos;s school and discovery tags in a cleaner editorial layout so recommendations feel intentional, not random.
                    </p>

                    <div className="mt-8 rounded-3xl border border-amber-200/80 bg-white/75 p-5 shadow-sm">
                      <p className="text-sm font-semibold text-slate-900">Why this matters</p>
                      <div className="mt-4 space-y-3 text-sm text-slate-600">
                        <p>School helps group chapters by academic context.</p>
                        <p>Tags power the low-cost content-based recommendation flow for students.</p>
                        <p>Cleaner metadata also improves future search, ranking, and filtering.</p>
                      </div>
                    </div>

                    {selectedChapter && (
                      <div className="mt-6 rounded-3xl bg-slate-900 px-5 py-5 text-white shadow-lg">
                        <p className="text-xs uppercase tracking-[0.22em] text-amber-300">Preview</p>
                        <p className="mt-3 text-lg font-bold">{selectedChapter.chapterName}</p>
                        <p className="mt-3 text-sm text-slate-300">
                          <span className="font-semibold text-white">School:</span> {school || 'Not selected'}
                        </p>
                        <p className="mt-2 text-sm text-slate-300">
                          <span className="font-semibold text-white">Tags:</span> {parseTags(tagsInput).join(', ') || 'No tags yet'}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="p-6 sm:p-8 lg:p-10">
                  <div className="flex flex-col gap-4 border-b border-slate-100 pb-6 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h2 className="text-2xl font-black text-slate-900 tracking-tight">Chapter Metadata</h2>
                      <p className="text-sm text-slate-600 mt-1">Manual tagging for the recommendation engine</p>
                    </div>

                    <button
                      type="button"
                      onClick={refreshData}
                      className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors self-start"
                    >
                      <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                      Refresh
                    </button>
                  </div>

                  <form onSubmit={handleSave} className="pt-6 space-y-6">
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                      <label className="block">
                        <span className="block text-sm font-semibold text-slate-700 mb-2">Chapter</span>
                        <select
                          value={selectedChapterId}
                          onChange={(e) => setSelectedChapterId(e.target.value)}
                          className="w-full rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3.5 text-black outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          {chapterOptions.map((chapter) => (
                            <option key={chapter.chapterId} value={chapter.chapterId}>
                              {chapter.chapterName}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="block">
                        <span className="block text-sm font-semibold text-slate-700 mb-2">School</span>
                        <select
                          value={school}
                          onChange={(e) => setSchool(e.target.value)}
                          className="w-full rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3.5 text-black outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="">Select a school</option>
                          {SCHOOL_OPTIONS.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <label className="block">
                      <span className="block text-sm font-semibold text-slate-700 mb-2">Tags</span>
                      <textarea
                        value={tagsInput}
                        onChange={(e) => setTagsInput(e.target.value)}
                        rows={7}
                        placeholder="ai, hackathon, coding, research"
                        className="w-full rounded-[24px] border border-slate-200 bg-slate-50/70 px-4 py-4 text-black outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                      />
                      <p className="text-sm text-slate-500 mt-2">Enter tags separated by commas.</p>
                    </label>

                    <div className="flex justify-end">
                      <button
                        type="submit"
                        disabled={isSaving}
                        className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-6 py-3.5 text-white font-semibold hover:bg-slate-800 disabled:opacity-60 disabled:cursor-not-allowed transition-colors shadow-lg shadow-slate-900/10"
                      >
                        <Save className="h-4 w-4" />
                        {isSaving ? 'Saving...' : 'Save Tags'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default ChapterTagManager;
