import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import { StatusBadge } from '../components/StatusBadge';
import type { Transcript } from '../types';

const PROCESSING = new Set(['UPLOADED', 'EXTRACTING', 'VERIFYING', 'REPORTING']);
const COMPLETE   = new Set(['COMPLETE']);
const REVIEWED   = new Set(['REVIEWED', 'APPROVED']);

type FilterTab = 'all' | 'processing' | 'flagged' | 'not_reviewed' | 'complete' | 'reviewed';

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: 'all',          label: 'All' },
  { key: 'processing',   label: 'Processing' },
  { key: 'flagged',      label: 'Flagged' },
  { key: 'not_reviewed', label: 'Not Reviewed' },
  { key: 'complete',     label: 'Complete' },
  { key: 'reviewed',     label: 'Reviewed' },
];

export default function Dashboard() {
  const [transcripts, setTranscripts] = useState<Transcript[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchTranscripts = (isInitial = false) => {
    api.listTranscripts()
      .then((data) => {
        setTranscripts(data);
        const anyProcessing = data.some((t) => PROCESSING.has(t.status));
        if (!anyProcessing && pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => { if (isInitial) setLoading(false); });
  };

  useEffect(() => {
    fetchTranscripts(true);
    pollRef.current = setInterval(() => fetchTranscripts(false), 5000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const filtered = useMemo(() => {
    switch (activeFilter) {
      case 'processing': return transcripts.filter((t) => PROCESSING.has(t.status));
      case 'flagged':    return transcripts.filter((t) => (t.flagCount ?? 0) > 0 || t.status === 'REVIEW_REQUIRED');
      case 'not_reviewed': return transcripts.filter((t) => COMPLETE.has(t.status));
      case 'complete':     return transcripts.filter((t) => COMPLETE.has(t.status) || REVIEWED.has(t.status));
      case 'reviewed':     return transcripts.filter((t) => REVIEWED.has(t.status));
      default:           return transcripts;
    }
  }, [transcripts, activeFilter]);

  const counts = useMemo(() => ({
    all:        transcripts.length,
    processing:   transcripts.filter((t) => PROCESSING.has(t.status)).length,
    flagged:      transcripts.filter((t) => (t.flagCount ?? 0) > 0 || t.status === 'REVIEW_REQUIRED').length,
    not_reviewed: transcripts.filter((t) => COMPLETE.has(t.status)).length,
    complete:     transcripts.filter((t) => COMPLETE.has(t.status) || REVIEWED.has(t.status)).length,
    reviewed:     transcripts.filter((t) => REVIEWED.has(t.status)).length,
  }), [transcripts]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-msbon-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500 dark:text-gray-400 text-sm">Loading transcripts…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center max-w-sm">
          <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-red-500" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
          </div>
          <p className="font-semibold text-gray-900 dark:text-white mb-1">Failed to load</p>
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h2 className="text-3xl font-extrabold text-gray-900 dark:text-white">Dashboard</h2>
          <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">
            {transcripts.length} transcript{transcripts.length !== 1 ? 's' : ''} in the system
          </p>
        </div>
        <Link
          to="/upload"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-msbon-700 dark:bg-msbon-600 text-white rounded-xl hover:bg-msbon-800 dark:hover:bg-msbon-700 text-sm font-semibold shadow-sm transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
          Upload Transcript
        </Link>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        {FILTER_TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveFilter(key)}
            className={`text-left p-4 rounded-xl border transition-all ${
              activeFilter === key
                ? 'bg-msbon-700 dark:bg-msbon-600 border-msbon-700 dark:border-msbon-600 text-white shadow-lg shadow-msbon-900/20'
                : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white hover:border-msbon-300 dark:hover:border-msbon-700 hover:shadow-sm'
            }`}
          >
            <div className={`text-2xl font-extrabold leading-none ${activeFilter === key ? 'text-white' : 'text-gray-900 dark:text-white'}`}>
              {counts[key]}
            </div>
            <div className={`text-xs mt-1 font-medium ${activeFilter === key ? 'text-blue-200' : 'text-gray-500 dark:text-gray-400'}`}>
              {label}
            </div>
          </button>
        ))}
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm">
          {transcripts.length === 0 ? (
            <>
              <div className="w-14 h-14 bg-gray-100 dark:bg-gray-800 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <svg className="w-7 h-7 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <p className="text-gray-500 dark:text-gray-400 mb-5">No transcripts uploaded yet.</p>
              <Link
                to="/upload"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-msbon-700 text-white rounded-xl hover:bg-msbon-800 text-sm font-semibold"
              >
                Upload Your First Transcript
              </Link>
            </>
          ) : (
            <p className="text-gray-500 dark:text-gray-400">No transcripts match this filter.</p>
          )}
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden overflow-x-auto">
          <table className="w-full min-w-[520px]">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60">
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">File</th>
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide hidden sm:table-cell">School</th>
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide hidden md:table-cell">Program</th>
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Status</th>
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Flags / Undet.</th>
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide hidden lg:table-cell">Uploaded</th>
                <th className="text-right px-5 py-3.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {filtered.map((t) => (
                <tr key={t.transcriptId} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                  <td className="px-5 py-4 text-sm font-medium text-gray-900 dark:text-white max-w-[160px] truncate" title={t.fileName}>
                    {t.fileName || 'Unknown'}
                  </td>
                  <td className="px-5 py-4 text-sm text-gray-600 dark:text-gray-400 hidden sm:table-cell">{t.schoolName || '—'}</td>
                  <td className="px-5 py-4 text-sm text-gray-600 dark:text-gray-400 hidden md:table-cell">{t.programType || '—'}</td>
                  <td className="px-5 py-4">
                    <StatusBadge status={t.status} />
                  </td>
                  <td className="px-5 py-4 text-sm">
                    <div className="flex items-center gap-1.5">
                      {t.flagCount != null ? (
                        <span className={`font-bold ${t.flagCount > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                          {t.flagCount > 0 ? t.flagCount : '—'}
                        </span>
                      ) : (
                        <span className="text-gray-400 dark:text-gray-600">—</span>
                      )}
                      {(t.undeterminedCount ?? 0) > 0 && (
                        <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-1.5 py-0.5 rounded">
                          {t.undeterminedCount}?
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-4 text-sm text-gray-500 dark:text-gray-400 hidden lg:table-cell">
                    {new Date(t.uploadDate).toLocaleDateString()}
                  </td>
                  <td className="px-5 py-4 text-right">
                    <Link
                      to={`/transcript/${t.transcriptId}`}
                      className="text-sm text-msbon-600 dark:text-msbon-400 hover:text-msbon-800 dark:hover:text-msbon-300 font-semibold whitespace-nowrap"
                    >
                      View →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
