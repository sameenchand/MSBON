import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../services/api';
import type { AuditEntry } from '../types';

export default function AuditLog() {
  const { id } = useParams<{ id: string }>();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    api
      .getAuditLog(id)
      .then(setEntries)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="text-center py-12 text-gray-500">Loading audit log...</div>;
  if (error) return <div className="text-center py-12 text-red-500">Error: {error}</div>;

  const actorColor: Record<string, string> = {
    system: 'bg-gray-100 text-gray-700',
    ai: 'bg-purple-100 text-purple-700',
  };

  return (
    <div className="max-w-4xl mx-auto">
      <Link to={`/transcript/${id}`} className="text-sm text-msbon-600 hover:text-msbon-800 mb-1 inline-block">
        &larr; Back to Verification
      </Link>
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Audit Trail</h2>

      {entries.length === 0 ? (
        <div className="bg-white rounded-lg border p-8 text-center text-gray-500">
          No audit entries found.
        </div>
      ) : (
        <div className="bg-white rounded-lg border overflow-hidden">
          <div className="divide-y">
            {entries.map((entry, i) => {
              const timestamp = entry.timestampEvent.split('#')[0];
              const badgeColor = actorColor[entry.actor] || 'bg-blue-100 text-blue-700';
              return (
                <div key={i} className="px-4 py-3 hover:bg-gray-50">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${badgeColor}`}>
                        {entry.actor}
                      </span>
                      <span className="font-medium text-sm text-gray-900">{entry.action}</span>
                    </div>
                    <span className="text-xs text-gray-400">
                      {new Date(timestamp).toLocaleString()}
                    </span>
                  </div>
                  {entry.ruleApplied && (
                    <p className="text-xs text-gray-500">Rule: {entry.ruleApplied}</p>
                  )}
                  {entry.sourceSection && (
                    <p className="text-xs text-gray-500">Source: {entry.sourceSection}</p>
                  )}
                  {entry.details && Object.keys(entry.details).length > 0 && (
                    <details className="mt-1">
                      <summary className="text-xs text-gray-400 cursor-pointer">Details</summary>
                      <pre className="text-xs text-gray-600 mt-1 bg-gray-50 p-2 rounded overflow-x-auto">
                        {JSON.stringify(entry.details, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-800">
          This audit trail records every action taken on this transcript, including AI analysis,
          rule applications, and human review decisions. All entries are immutable and
          timestamped for compliance purposes.
        </p>
      </div>
    </div>
  );
}
