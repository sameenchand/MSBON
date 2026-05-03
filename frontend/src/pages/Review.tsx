import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../services/api';
import { StatusBadge, RiskBadge } from '../components/StatusBadge';
import type { Transcript, Verification, ReviewAction, RuleResult } from '../types';

function formatRuleId(ruleId: string): string {
  return ruleId.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function RuleStatusDot({ status }: { status: string }) {
  if (status === 'PASS') return <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0 mt-1.5" />;
  if (status === 'FLAG') return <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0 mt-1.5" />;
  return <span className="w-2 h-2 rounded-full bg-yellow-400 flex-shrink-0 mt-1.5" />;
}

function ConfidencePips({ level }: { level: string }) {
  const filled = level === 'HIGH' ? 3 : level === 'MEDIUM' ? 2 : 1;
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3].map((i) => (
        <span key={i} className={`w-1.5 h-1.5 rounded-full ${i <= filled ? 'bg-gray-500' : 'bg-gray-200'}`} />
      ))}
    </div>
  );
}

function RiskMeter({ level }: { level: string }) {
  const pct = level === 'HIGH' ? 85 : level === 'MEDIUM' ? 50 : 15;
  const color = level === 'HIGH' ? 'bg-red-500' : level === 'MEDIUM' ? 'bg-amber-400' : 'bg-green-500';
  return (
    <div className="w-full bg-gray-100 rounded-full h-2">
      <div className={`${color} h-2 rounded-full transition-all`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function Review() {
  const { id } = useParams<{ id: string }>();
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [verification, setVerification] = useState<Verification | null>(null);
  const [reviews, setReviews] = useState<ReviewAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [annotations, setAnnotations] = useState('');
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [activeRule, setActiveRule] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      api.getTranscript(id).catch(() => null),
      api.getVerification(id).catch(() => []),
      api.getReviews(id).catch(() => []),
    ])
      .then(([t, verifications, revs]) => {
        setTranscript(t);
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
        return { ruleId, originalStatus: original?.status || '', newStatus, justification: annotations };
      });
      await api.createReview({ transcriptId: id, reviewerId: 'staff-user', action, overrides: overrideList, annotations });
      setSuccess(`Review submitted: ${action}`);
      const revs = await api.getReviews(id);
      setReviews(revs);
      setOverrides({});
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Review failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-msbon-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500 text-sm">Loading review workspace…</p>
        </div>
      </div>
    );
  }

  const flagged = verification?.ruleResults.filter((r: RuleResult) => r.status === 'FLAG') || [];
  const passed = verification?.ruleResults.filter((r: RuleResult) => r.status === 'PASS') || [];
  const undetermined = verification?.ruleResults.filter((r: RuleResult) => r.status === 'UNABLE_TO_DETERMINE') || [];
  const total = verification?.ruleResults.length || 0;
  const activeRuleData = activeRule ? verification?.ruleResults.find((r) => r.ruleId === activeRule) : null;

  return (
    <div>
      {/* Top bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <Link to={`/transcript/${id}`} className="text-sm text-msbon-600 hover:text-msbon-800 inline-flex items-center gap-1">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Analysis
          </Link>
          <h2 className="text-2xl font-bold text-gray-900 mt-1">Review Workspace</h2>
          {transcript && <p className="text-sm text-gray-500 mt-0.5">{transcript.fileName}</p>}
        </div>
        {verification && (
          <div className="flex items-center gap-2">
            <RiskBadge level={verification.riskLevel} />
            <StatusBadge status={verification.overallStatus} />
          </div>
        )}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center gap-2">
          <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700 flex items-center gap-2">
          <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
          {success}
        </div>
      )}

      {/* Split panel */}
      <div className="lg:grid lg:grid-cols-[340px_1fr] lg:gap-6 lg:items-start">

        {/* ── LEFT PANEL: Transcript overview + rule checklist ── */}
        <div className="lg:sticky lg:top-[72px] lg:max-h-[calc(100vh-100px)] lg:overflow-y-auto space-y-4 mb-6 lg:mb-0 pb-4">

          {/* Transcript card */}
          <div className="bg-white rounded-xl border shadow-sm p-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Transcript</p>
            <div className="space-y-2">
              {[
                { label: 'File', value: transcript?.fileName || '—' },
                { label: 'School', value: transcript?.schoolName || '—' },
                { label: 'Program', value: transcript?.programType || '—' },
                { label: 'Uploaded', value: transcript ? new Date(transcript.uploadDate).toLocaleDateString() : '—' },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between gap-2 text-sm">
                  <span className="text-gray-500 flex-shrink-0">{label}</span>
                  <span className="font-medium text-gray-900 text-right truncate">{value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Risk overview */}
          <div className="bg-white rounded-xl border shadow-sm p-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Risk Overview</p>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600">Risk Level</span>
              <RiskBadge level={verification?.riskLevel || 'MEDIUM'} />
            </div>
            <RiskMeter level={verification?.riskLevel || 'MEDIUM'} />
            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              <div className="bg-red-50 rounded-lg p-2">
                <div className="text-xl font-bold text-red-600">{flagged.length}</div>
                <div className="text-xs text-red-500">Flagged</div>
              </div>
              <div className="bg-green-50 rounded-lg p-2">
                <div className="text-xl font-bold text-green-600">{passed.length}</div>
                <div className="text-xs text-green-500">Passed</div>
              </div>
              <div className="bg-yellow-50 rounded-lg p-2">
                <div className="text-xl font-bold text-yellow-600">{undetermined.length}</div>
                <div className="text-xs text-yellow-500">Unknown</div>
              </div>
            </div>
          </div>

          {/* All rule results checklist */}
          <div className="bg-white rounded-xl border shadow-sm p-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
              {total} Verification Checks
            </p>
            <div className="space-y-1">
              {verification?.ruleResults.map((r) => (
                <button
                  key={r.ruleId}
                  onClick={() => setActiveRule(activeRule === r.ruleId ? null : r.ruleId)}
                  className={`w-full flex items-start gap-2 px-2 py-1.5 rounded-lg text-left transition-colors text-xs hover:bg-gray-50 ${activeRule === r.ruleId ? 'bg-msbon-50 ring-1 ring-msbon-200' : ''}`}
                >
                  <RuleStatusDot status={overrides[r.ruleId] || r.status} />
                  <span className={`flex-1 leading-tight ${r.status === 'FLAG' ? 'font-medium text-gray-900' : 'text-gray-600'}`}>
                    {formatRuleId(r.ruleId)}
                  </span>
                  {overrides[r.ruleId] && overrides[r.ruleId] !== r.status && (
                    <span className="text-[10px] bg-amber-100 text-amber-700 px-1 rounded">overridden</span>
                  )}
                </button>
              ))}
            </div>

            {/* Expanded rule detail */}
            {activeRuleData && (
              <div className={`mt-3 p-3 rounded-lg border text-xs ${
                activeRuleData.status === 'FLAG' ? 'bg-red-50 border-red-200' :
                activeRuleData.status === 'PASS' ? 'bg-green-50 border-green-200' :
                'bg-yellow-50 border-yellow-200'
              }`}>
                <p className="font-medium text-gray-900 mb-1">{formatRuleId(activeRuleData.ruleId)}</p>
                <p className="text-gray-700 leading-relaxed">{activeRuleData.explanation}</p>
                {activeRuleData.sourceSection && (
                  <p className="mt-1.5 text-gray-500">Source: <span className="font-medium">{activeRuleData.sourceSection}</span></p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT PANEL: AI analysis + review actions ── */}
        <div className="space-y-5">

          {/* AI Analysis */}
          {verification?.aiAnalysis && (
            <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
              <div className="bg-gradient-to-r from-msbon-900 to-msbon-700 px-5 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-blue-300" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3z" />
                    </svg>
                    <span className="text-sm font-semibold text-white">AI Analysis</span>
                  </div>
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                    verification.aiAnalysis.recommendation === 'APPROVE' ? 'bg-green-400/20 text-green-300' :
                    verification.aiAnalysis.recommendation === 'ESCALATE' ? 'bg-red-400/20 text-red-300' :
                    'bg-yellow-400/20 text-yellow-300'
                  }`}>
                    {verification.aiAnalysis.recommendation}
                  </span>
                </div>
              </div>
              <div className="p-5 space-y-4">
                <p className="text-sm text-gray-700 leading-relaxed">{verification.aiAnalysis.summary}</p>
                {verification.aiAnalysis.reasoning && (
                  <div className="bg-gray-50 rounded-lg p-3 border-l-4 border-msbon-400">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Reasoning</p>
                    <p className="text-sm text-gray-700 leading-relaxed">{verification.aiAnalysis.reasoning}</p>
                  </div>
                )}
                {verification.aiAnalysis.additionalFlags.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Additional AI Flags</p>
                    <div className="space-y-2">
                      {verification.aiAnalysis.additionalFlags.map((flag, i) => (
                        <div key={i} className="flex gap-3 p-3 bg-red-50 border border-red-100 rounded-lg">
                          <span className={`flex-shrink-0 text-xs font-bold px-1.5 py-0.5 rounded self-start ${
                            flag.severity === 'HIGH' ? 'bg-red-100 text-red-700' :
                            flag.severity === 'MEDIUM' ? 'bg-amber-100 text-amber-700' :
                            'bg-gray-100 text-gray-600'
                          }`}>{flag.severity}</span>
                          <div>
                            <p className="text-sm font-medium text-gray-900">{flag.issue}</p>
                            {flag.details && <p className="text-xs text-gray-500 mt-0.5">{flag.details}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Flagged items — one per card with inline override */}
          {flagged.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3 flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-red-100 text-red-600 text-xs flex items-center justify-center font-bold">{flagged.length}</span>
                Flagged Items — Review Required
              </h3>
              <div className="space-y-3">
                {flagged.map((r: RuleResult) => {
                  const overrideStatus = overrides[r.ruleId];
                  const isOverridden = overrideStatus && overrideStatus !== 'FLAG';
                  return (
                    <div key={r.ruleId} className={`rounded-xl border shadow-sm overflow-hidden transition-all ${isOverridden ? 'opacity-70' : ''}`}>
                      {/* Card header */}
                      <div className={`px-4 py-3 flex items-center justify-between gap-3 ${isOverridden ? 'bg-gray-50' : 'bg-red-50'}`}>
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isOverridden ? 'bg-gray-400' : 'bg-red-500'}`} />
                          <h4 className="font-semibold text-sm text-gray-900 truncate">{formatRuleId(r.ruleId)}</h4>
                          <ConfidencePips level={r.confidence} />
                        </div>
                        <select
                          className="text-xs border rounded-lg px-2 py-1.5 bg-white shadow-sm focus:ring-2 focus:ring-msbon-400 focus:outline-none flex-shrink-0"
                          value={overrides[r.ruleId] || 'FLAG'}
                          onChange={(e) => handleOverride(r.ruleId, e.target.value)}
                        >
                          <option value="FLAG">⚑ Keep Flag</option>
                          <option value="PASS">✓ Override: Pass</option>
                          <option value="UNABLE_TO_DETERMINE">? Mark Undetermined</option>
                        </select>
                      </div>
                      {/* Card body */}
                      <div className="px-4 py-3 bg-white">
                        <p className="text-sm text-gray-700 leading-relaxed">{r.explanation}</p>
                        {r.sourceSection && (
                          <div className="mt-2 inline-flex items-center gap-1.5 text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-md">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h10M7 11h10M7 15h4" />
                            </svg>
                            {r.sourceSection}
                          </div>
                        )}
                        {isOverridden && (
                          <p className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                            Overridden to: <strong>{overrideStatus}</strong> — justification required in notes below
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Passed items — collapsed */}
          {passed.length > 0 && (
            <details className="bg-white rounded-xl border shadow-sm">
              <summary className="px-4 py-3 cursor-pointer text-sm font-medium text-gray-600 hover:bg-gray-50 rounded-xl select-none flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-green-100 text-green-600 text-xs flex items-center justify-center font-bold">{passed.length}</span>
                Passed Checks — click to expand
              </summary>
              <div className="px-4 pb-4 pt-2 space-y-2">
                {passed.map((r: RuleResult) => (
                  <div key={r.ruleId} className="flex items-start gap-2 text-sm py-1.5 border-b border-gray-50 last:border-0">
                    <svg className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <div>
                      <p className="font-medium text-gray-800">{formatRuleId(r.ruleId)}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{r.explanation}</p>
                    </div>
                  </div>
                ))}
              </div>
            </details>
          )}

          {/* Reviewer notes */}
          <div className="bg-white rounded-xl border shadow-sm p-5">
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Reviewer Notes
              {Object.keys(overrides).length > 0 && (
                <span className="ml-2 text-xs font-normal text-amber-600">Required when overriding findings</span>
              )}
            </label>
            <textarea
              className="w-full border border-gray-200 rounded-lg p-3 text-sm text-gray-800 placeholder-gray-400 focus:ring-2 focus:ring-msbon-400 focus:border-transparent focus:outline-none resize-none"
              rows={4}
              placeholder="Add your observations, justifications for any overrides, or notes for follow-up…"
              value={annotations}
              onChange={(e) => setAnnotations(e.target.value)}
            />
          </div>

          {/* Action buttons */}
          <div className="bg-white rounded-xl border shadow-sm p-5">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Submit Decision</p>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => submitReview('CONFIRM')}
                disabled={submitting}
                className="flex-1 min-w-[140px] flex items-center justify-center gap-2 px-5 py-3 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors shadow-sm"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Confirm Findings
              </button>
              {Object.keys(overrides).length > 0 && (
                <button
                  onClick={() => submitReview('OVERRIDE')}
                  disabled={submitting}
                  className="flex-1 min-w-[140px] flex items-center justify-center gap-2 px-5 py-3 bg-amber-500 text-white text-sm font-semibold rounded-lg hover:bg-amber-600 disabled:opacity-50 transition-colors shadow-sm"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  Submit with {Object.keys(overrides).length} Override{Object.keys(overrides).length !== 1 ? 's' : ''}
                </button>
              )}
              <button
                onClick={() => submitReview('ANNOTATE')}
                disabled={submitting || !annotations.trim()}
                className="flex items-center justify-center gap-2 px-5 py-3 border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 disabled:opacity-40 transition-colors"
              >
                Save Notes Only
              </button>
            </div>
            <p className="mt-3 text-xs text-gray-400">
              All submissions are permanently logged in the audit trail with your reviewer ID and timestamp.
            </p>
          </div>

          {/* Review history */}
          {reviews.length > 0 && (
            <div className="bg-white rounded-xl border shadow-sm p-5">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Review History</p>
              <div className="space-y-3">
                {reviews.map((rev) => (
                  <div key={rev.reviewId} className="flex gap-3">
                    <div className="w-8 h-8 rounded-full bg-msbon-100 flex items-center justify-center flex-shrink-0">
                      <svg className="w-4 h-4 text-msbon-600" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-900">{rev.reviewerId}</span>
                          <StatusBadge status={rev.action} />
                        </div>
                        <span className="text-xs text-gray-400">{new Date(rev.timestamp).toLocaleString()}</span>
                      </div>
                      {rev.annotations && <p className="mt-1 text-sm text-gray-600">{rev.annotations}</p>}
                      {rev.overrides.length > 0 && (
                        <p className="mt-1 text-xs text-amber-700">{rev.overrides.length} override(s) applied</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
