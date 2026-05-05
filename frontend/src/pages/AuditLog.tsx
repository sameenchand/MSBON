import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../services/api';
import type { AuditEntry } from '../types';

const ACTOR_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  system: { label: 'System', color: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300', dot: 'bg-gray-400' },
  ai:     { label: 'AI', color: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400', dot: 'bg-purple-500' },
  staff:  { label: 'Staff', color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400', dot: 'bg-blue-500' },
};

export default function AuditLog() {
  const { id } = useParams<{ id: string }>();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    api.getAuditLog(id)
      .then(setEntries)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-msbon-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500 dark:text-gray-400 text-sm">Loading audit trail…</p>
        </div>
      </div>
    );
  }
  if (error) return <div className="text-center py-12 text-red-500">{error}</div>;

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <Link to={`/transcript/${id}`} className="inline-flex items-center gap-1 text-sm text-msbon-600 dark:text-msbon-400 hover:text-msbon-800 dark:hover:text-msbon-300 mb-2">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Analysis
        </Link>
        <h2 className="text-3xl font-extrabold text-gray-900 dark:text-white">Audit Trail</h2>
        <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">
          Immutable record of every action taken on this transcript.
        </p>
      </div>

      {/* Stats bar */}
      {entries.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { label: 'Total Events', value: entries.length },
            { label: 'AI Actions', value: entries.filter((e) => e.actor === 'ai').length },
            { label: 'System Events', value: entries.filter((e) => e.actor === 'system').length },
          ].map(({ label, value }) => (
            <div key={label} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-4 shadow-sm text-center">
              <div className="text-2xl font-extrabold text-gray-900 dark:text-white">{value}</div>
              <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{label}</div>
            </div>
          ))}
        </div>
      )}

      {entries.length === 0 ? (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-12 text-center">
          <svg className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <p className="text-gray-500 dark:text-gray-400">No audit entries found.</p>
        </div>
      ) : (
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-[18px] top-0 bottom-0 w-px bg-gray-200 dark:bg-gray-700" />

          <div className="space-y-3">
            {[...entries].reverse().map((entry, i) => {
              const timestamp = entry.timestampEvent.split('#')[0];
              const actor = entry.actor?.toLowerCase() || 'system';
              const cfg = ACTOR_CONFIG[actor] || ACTOR_CONFIG.system;

              return (
                <div key={i} className="relative flex gap-4">
                  {/* Timeline dot */}
                  <div className={`relative z-10 w-9 h-9 rounded-full border-2 border-white dark:border-gray-950 flex items-center justify-center flex-shrink-0 ${cfg.dot} shadow-sm`}>
                    {actor === 'ai' ? (
                      <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3z" />
                      </svg>
                    ) : actor === 'staff' ? (
                      <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
                      </svg>
                    )}
                  </div>

                  {/* Card */}
                  <div className="flex-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-4 shadow-sm hover:shadow-md dark:hover:border-gray-600 transition-all mb-1">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${cfg.color}`}>
                          {cfg.label}
                        </span>
                        <span className="font-semibold text-sm text-gray-900 dark:text-white">{entry.action}</span>
                      </div>
                      <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">
                        {new Date(timestamp).toLocaleString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })} CST
                      </span>
                    </div>

                    {(entry.ruleApplied || entry.sourceSection) && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {entry.ruleApplied && (
                          <span className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 px-2 py-0.5 rounded-md">
                            Rule: {entry.ruleApplied}
                          </span>
                        )}
                        {entry.sourceSection && (
                          <span className="text-xs bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded-md">
                            Source: {entry.sourceSection}
                          </span>
                        )}
                      </div>
                    )}

                    {entry.details && Object.keys(entry.details).length > 0 && (
                      <details className="mt-2">
                        <summary className="text-xs text-gray-400 dark:text-gray-500 cursor-pointer hover:text-gray-600 dark:hover:text-gray-300 select-none">
                          View details
                        </summary>
                        <div className="mt-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 space-y-1.5">
                          {Object.entries(entry.details).map(([key, val]) => {
                            const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase());
                            let display: string;
                            if (Array.isArray(val)) {
                              display = val.length === 0 ? 'None' : `${val.length} item${val.length !== 1 ? 's' : ''}`;
                            } else if (val === null || val === undefined || val === '') {
                              display = '—';
                            } else if (typeof val === 'object') {
                              display = JSON.stringify(val);
                            } else {
                              display = String(val);
                            }
                            return (
                              <div key={key} className="flex gap-2 text-xs">
                                <span className="text-gray-400 dark:text-gray-500 flex-shrink-0 w-28 truncate">{label}</span>
                                <span className="text-gray-700 dark:text-gray-300 break-all">{display}</span>
                              </div>
                            );
                          })}
                        </div>
                      </details>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Compliance note */}
      <div className="mt-8 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-2xl p-5">
        <div className="flex gap-3">
          <svg className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          <p className="text-sm text-blue-800 dark:text-blue-300 leading-relaxed">
            All audit entries are immutable and timestamped. Every AI finding, rule application, and human review decision is permanently recorded for compliance and accountability.
          </p>
        </div>
      </div>
    </div>
  );
}
