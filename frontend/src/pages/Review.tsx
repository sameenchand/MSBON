import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../services/api';
import { StatusBadge } from '../components/StatusBadge';
import type { Verification, ReviewAction, RuleResult } from '../types';

export default function Review() {
  const { id } = useParams<{ id: string }>();
  const [verification, setVerification] = useState<Verification | null>(null);
  const [reviews, setReviews] = useState<ReviewAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [annotations, setAnnotations] = useState('');
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (!id) return;
    Promise.all([
      api.getVerification(id).catch(() => []),
      api.getReviews(id).catch(() => []),
    ])
      .then(([verifications, revs]) => {
        if (verifications.length > 0) setVerification(verifications[0]);
        setReviews(revs);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  const handleOverride = (ruleId: string, newStatus: string) => {
    setOverrides((prev) => ({ ...prev, [ruleId]: newStatus }));
  };

  const submitReview = async (action: 'CONFIRM' | 'OVERRIDE' | 'ANNOTATE') => {
    if (!id) return;
    setSubmitting(true);
    setError('');
    try {
      const overrideList = Object.entries(overrides).map(([ruleId, newStatus]) => {
        const original = verification?.ruleResults.find((r) => r.ruleId === ruleId);
        return {
          ruleId,
          originalStatus: original?.status || '',
          newStatus,
          justification: annotations,
        };
      });

      await api.createReview({
        transcriptId: id,
        reviewerId: 'staff-user',
        action,
        overrides: overrideList,
        annotations,
      });
      setSuccess(`Review submitted: ${action}`);
      const revs = await api.getReviews(id);
      setReviews(revs);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Review failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="text-center py-12 text-gray-500">Loading...</div>;

  const flagged = verification?.ruleResults.filter((r: RuleResult) => r.status === 'FLAG') || [];

  return (
    <div className="max-w-4xl mx-auto">
      <Link to={`/transcript/${id}`} className="text-sm text-msbon-600 hover:text-msbon-800 mb-1 inline-block">
        &larr; Back to Verification
      </Link>
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Human Review</h2>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
      )}
      {success && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">{success}</div>
      )}

      {/* Flagged items for review */}
      {flagged.length > 0 && (
        <div className="bg-white rounded-lg border p-4 mb-6">
          <h3 className="text-lg font-semibold mb-3">Flagged Items</h3>
          <div className="space-y-4">
            {flagged.map((r: RuleResult) => (
              <div key={r.ruleId} className="border border-red-200 rounded-lg p-4 bg-red-50">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium">{r.ruleId.replace(/^check_/, '').replace(/_/g, ' ')}</h4>
                  <select
                    className="border rounded px-2 py-1 text-sm"
                    value={overrides[r.ruleId] || r.status}
                    onChange={(e) => handleOverride(r.ruleId, e.target.value)}
                  >
                    <option value="FLAG">Keep Flag</option>
                    <option value="PASS">Override to Pass</option>
                    <option value="UNABLE_TO_DETERMINE">Mark Undetermined</option>
                  </select>
                </div>
                <p className="text-sm text-gray-700">{r.explanation}</p>
                <p className="text-xs text-gray-500 mt-1">Source: {r.sourceSection}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Annotations */}
      <div className="bg-white rounded-lg border p-4 mb-6">
        <h3 className="text-lg font-semibold mb-3">Reviewer Notes</h3>
        <textarea
          className="w-full border rounded-lg p-3 text-sm"
          rows={4}
          placeholder="Add notes, justifications, or observations..."
          value={annotations}
          onChange={(e) => setAnnotations(e.target.value)}
        />
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={() => submitReview('CONFIRM')}
          disabled={submitting}
          className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
        >
          Confirm Findings
        </button>
        {Object.keys(overrides).length > 0 && (
          <button
            onClick={() => submitReview('OVERRIDE')}
            disabled={submitting}
            className="px-6 py-3 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 disabled:opacity-50"
          >
            Submit with Overrides
          </button>
        )}
        <button
          onClick={() => submitReview('ANNOTATE')}
          disabled={submitting || !annotations}
          className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50"
        >
          Save Notes Only
        </button>
      </div>

      {/* Previous reviews */}
      {reviews.length > 0 && (
        <div className="mt-8">
          <h3 className="text-lg font-semibold mb-3">Review History</h3>
          <div className="space-y-3">
            {reviews.map((rev) => (
              <div key={rev.reviewId} className="bg-white rounded-lg border p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <StatusBadge status={rev.action} />
                    <span className="text-sm text-gray-600">by {rev.reviewerId}</span>
                  </div>
                  <span className="text-xs text-gray-400">
                    {new Date(rev.timestamp).toLocaleString()}
                  </span>
                </div>
                {rev.annotations && (
                  <p className="mt-2 text-sm text-gray-700">{rev.annotations}</p>
                )}
                {rev.overrides.length > 0 && (
                  <p className="mt-1 text-xs text-gray-500">
                    {rev.overrides.length} override(s) applied
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
