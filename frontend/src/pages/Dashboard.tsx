import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import { StatusBadge } from '../components/StatusBadge';
import type { Transcript } from '../types';

const PROCESSING = new Set(['UPLOADED', 'EXTRACTING', 'VERIFYING', 'REPORTING']);
const COMPLETE = new Set(['COMPLETE', 'APPROVED', 'REVIEWED']);

type FilterTab = 'all' | 'processing' | 'flagged' | 'complete';

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'processing', label: 'Processing' },
  { key: 'flagged', label: 'Flagged' },
  { key: 'complete', label: 'Complete' },
];

export default function Dashboard() {
  const [transcripts, setTranscripts] = useState<Transcript[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchTranscripts = (isInitial = false) => {
    api
      .listTranscripts()
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
      case 'flagged': return transcripts.filter((t) => (t.flagCount ?? 0) > 0 || t.status === 'REVIEW_REQUIRED');
      case 'complete': return transcripts.filter((t) => COMPLETE.has(t.status));
      default: return transcripts;
    }
  }, [transcripts, activeFilter]);

  const counts = useMemo(() => ({
    all: transcripts.length,
    processing: transcripts.filter((t) => PROCESSING.has(t.status)).length,
    flagged: transcripts.filter((t) => (t.flagCount ?? 0) > 0 || t.status === 'REVIEW_REQUIRED').length,
    complete: transcripts.filter((t) => COMPLETE.has(t.status)).length,
  }), [transcripts]);

  if (loading) return <div className="text-center py-12 text-gray-500">Loading transcripts...</div>;
  if (error) return <div className="text-center py-12 text-red-500">Error: {error}</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Transcript Dashboard</h2>
        <Link
          to="/upload"
          className="px-4 py-2 bg-msbon-600 text-white rounded-lg hover:bg-msbon-700 transition-colors"
        >
          Upload Transcript
        </Link>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 mb-4 border-b border-gray-200">
        {FILTER_TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveFilter(key)}
            className={`px-4 py-2 text-sm font-medium rounded-t-md transition-colors ${
              activeFilter === key
                ? 'bg-white border border-b-white border-gray-200 text-msbon-700 -mb-px'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
            {counts[key] > 0 && (
              <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${
                key === 'flagged' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'
              }`}>
                {counts[key]}
              </span>
            )}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg border">
          {transcripts.length === 0 ? (
            <>
              <p className="text-gray-500 mb-4">No transcripts uploaded yet.</p>
              <Link
                to="/upload"
                className="px-4 py-2 bg-msbon-600 text-white rounded-lg hover:bg-msbon-700"
              >
                Upload Your First Transcript
              </Link>
            </>
          ) : (
            <p className="text-gray-500">No transcripts match this filter.</p>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-lg border overflow-hidden overflow-x-auto">
          <table className="w-full min-w-[480px]">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">File</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600 hidden sm:table-cell">School</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600 hidden md:table-cell">Program</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Status</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Flags</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600 hidden lg:table-cell">Uploaded</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((t) => (
                <tr key={t.transcriptId} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm max-w-[140px] truncate" title={t.fileName}>{t.fileName || 'Unknown'}</td>
                  <td className="px-4 py-3 text-sm hidden sm:table-cell">{t.schoolName || '-'}</td>
                  <td className="px-4 py-3 text-sm hidden md:table-cell">{t.programType || '-'}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={t.status} />
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {t.flagCount != null ? (
                      <span className={`font-medium ${t.flagCount > 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {t.flagCount > 0 ? `${t.flagCount}` : '—'}
                      </span>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500 hidden lg:table-cell">
                    {new Date(t.uploadDate).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      to={`/transcript/${t.transcriptId}`}
                      className="text-sm text-msbon-600 hover:text-msbon-800 font-medium whitespace-nowrap"
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
