import { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../services/api';
import { StatusBadge, RiskBadge } from '../components/StatusBadge';
import type { Transcript, Verification, ReviewAction, RuleResult, ExtractedTranscript } from '../types';

type RightTab = 'transcript' | 'analysis' | 'review';

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
  const [extracted, setExtracted] = useState<ExtractedTranscript | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [reviews, setReviews] = useState<ReviewAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [annotations, setAnnotations] = useState('');
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [activeRule, setActiveRule] = useState<string | null>(null);
  const [rightTab, setRightTab] = useState<RightTab>('transcript');

  useEffect(() => {
    if (!id) return;
    Promise.all([
      api.getTranscript(id).catch(() => null),
      api.getVerification(id).catch(() => []),
      api.getReviews(id).catch(() => []),
      api.getExtractedData(id).catch(() => null),
      api.getTranscriptPdfUrl(id).catch(() => null),
    ])
      .then(([t, verifications, revs, ext, pdf]) => {
        setTranscript(t);
        if (verifications.length > 0) setVerification(verifications[0]);
        setReviews(revs);
        setExtracted(ext);
        setPdfUrl(pdf);
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
      // Re-fetch transcript (status updates to REVIEWED) and reviews in parallel
      const [updatedTranscript, revs] = await Promise.all([
        api.getTranscript(id),
        api.getReviews(id),
      ]);
      setTranscript(updatedTranscript);
      setReviews(revs);
      setOverrides({});
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Review failed');
    } finally {
      setSubmitting(false);
    }
  };

  // Build a map of ruleId → newStatus from the latest OVERRIDE review (already submitted)
  const committedOverrides = useMemo<Record<string, string>>(() => {
    const overrideReviews = reviews.filter((r) => r.action === 'OVERRIDE');
    if (overrideReviews.length === 0) return {};
    const latest = overrideReviews[overrideReviews.length - 1];
    return Object.fromEntries(latest.overrides.map((ov) => [ov.ruleId, ov.newStatus]));
  }, [reviews]);

  // Effective rule results: committed overrides > pending local overrides > original AI status
  // Must be before any early returns to satisfy Rules of Hooks
  const effectiveResults: RuleResult[] = useMemo(() => (
    verification?.ruleResults.map((r) => ({
      ...r,
      status: (committedOverrides[r.ruleId] ?? overrides[r.ruleId] ?? r.status) as RuleResult['status'],
    })) ?? []
  ), [verification, committedOverrides, overrides]);

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

  const flagged       = effectiveResults.filter((r) => r.status === 'FLAG');
  const passed        = effectiveResults.filter((r) => r.status === 'PASS');
  const undetermined  = effectiveResults.filter((r) => r.status === 'UNABLE_TO_DETERMINE');
  const total = effectiveResults.length;
  const activeRuleData = activeRule ? effectiveResults.find((r) => r.ruleId === activeRule) : null;

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
              {effectiveResults.map((r) => {
                const originalStatus = verification?.ruleResults.find((orig) => orig.ruleId === r.ruleId)?.status;
                const isOverridden = r.status !== originalStatus;
                return (
                  <button
                    key={r.ruleId}
                    onClick={() => setActiveRule(activeRule === r.ruleId ? null : r.ruleId)}
                    className={`w-full flex items-start gap-2 px-2 py-1.5 rounded-lg text-left transition-colors text-xs hover:bg-gray-50 ${activeRule === r.ruleId ? 'bg-msbon-50 ring-1 ring-msbon-200' : ''}`}
                  >
                    <RuleStatusDot status={r.status} />
                    <span className={`flex-1 leading-tight ${r.status === 'FLAG' ? 'font-medium text-gray-900' : 'text-gray-600'}`}>
                      {formatRuleId(r.ruleId)}
                    </span>
                    {isOverridden && (
                      <span className="text-[10px] bg-amber-100 text-amber-700 px-1 rounded">overridden</span>
                    )}
                  </button>
                );
              })}
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

        {/* ── RIGHT PANEL: Tabbed — Transcript | Analysis | Review ── */}
        <div className="space-y-5">

          {/* Tab bar */}
          <div className="flex border-b border-gray-200 bg-white rounded-t-xl overflow-hidden shadow-sm">
            {([
              { key: 'transcript' as RightTab, label: 'Transcript View', icon: (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              )},
              { key: 'analysis' as RightTab, label: 'AI Analysis', icon: (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              )},
              { key: 'review' as RightTab, label: 'Review & Submit', icon: (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )},
            ] as { key: RightTab; label: string; icon: React.ReactNode }[]).map(({ key, label, icon }) => (
              <button
                key={key}
                onClick={() => setRightTab(key)}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                  rightTab === key
                    ? 'border-msbon-600 text-msbon-700 bg-msbon-50/50'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
              >
                {icon}
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>

          {/* ── TAB: TRANSCRIPT VIEW ── */}
          {rightTab === 'transcript' && (
            <div className="space-y-4">

              {/* PDF viewer */}
              <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                    <svg className="w-3.5 h-3.5 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                    </svg>
                    Original Transcript PDF
                  </p>
                  {pdfUrl && (
                    <a href={pdfUrl} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-msbon-600 hover:text-msbon-800 font-medium flex items-center gap-1">
                      Open full screen
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                  )}
                </div>
                {pdfUrl ? (
                  <iframe
                    src={pdfUrl}
                    className="w-full border-0"
                    style={{ height: '70vh' }}
                    title="Transcript PDF"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                    <svg className="w-10 h-10 mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <p className="text-sm">PDF not available yet</p>
                    <p className="text-xs mt-1">Pipeline may still be processing</p>
                  </div>
                )}
              </div>

              {!extracted ? (
                <div className="bg-white rounded-xl border shadow-sm p-8 text-center text-gray-400 text-sm">
                  Extracted data not available yet — pipeline may still be processing.
                </div>
              ) : (
                <>
                  {/* Header info */}
                  <div className="bg-white rounded-xl border shadow-sm p-5">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div>
                        <h3 className="font-bold text-gray-900 text-base">{extracted.institutions?.[0] || transcript?.schoolName || '—'}</h3>
                        <p className="text-sm text-gray-500 mt-0.5">{extracted.program_name || transcript?.programType || '—'}</p>
                      </div>
                      <div className="flex flex-wrap gap-2 text-xs">
                        {extracted.graduation_date && (
                          <span className="bg-green-50 border border-green-200 text-green-800 px-2.5 py-1 rounded-full font-medium">
                            Graduated {extracted.graduation_date}
                          </span>
                        )}
                        {extracted.graduation_confirmed && (
                          <span className="bg-blue-50 border border-blue-200 text-blue-800 px-2.5 py-1 rounded-full font-medium">
                            Degree Conferred
                          </span>
                        )}
                        {extracted.total_credit_hours > 0 && (
                          <span className="bg-gray-100 border border-gray-200 text-gray-700 px-2.5 py-1 rounded-full font-medium">
                            {extracted.total_credit_hours} credit hours
                          </span>
                        )}
                      </div>
                    </div>

                    {/* GPA grid */}
                    {extracted.gpa_info && Object.keys(extracted.gpa_info).length > 0 && (
                      <div className="mt-4 flex flex-wrap gap-3">
                        {Object.entries(extracted.gpa_info).map(([key, val]) => (
                          <div key={key} className="text-center bg-gray-50 rounded-lg px-4 py-2 border">
                            <div className={`text-xl font-bold ${Number(val) >= 2.0 ? 'text-green-600' : 'text-red-600'}`}>{Number(val).toFixed(2)}</div>
                            <div className="text-xs text-gray-500 capitalize">{key.replace(/_/g, ' ')} GPA</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Enrollment terms */}
                  {extracted.enrollment_terms?.length > 0 && (
                    <div className="bg-white rounded-xl border shadow-sm p-5">
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Enrollment Terms</p>
                      <div className="flex flex-wrap gap-2">
                        {extracted.enrollment_terms.map((term) => (
                          <span key={term} className="text-xs bg-blue-50 border border-blue-100 text-blue-700 px-2.5 py-1 rounded-full">{term}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Course table */}
                  {extracted.courses?.length > 0 && (
                    <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                      <div className="px-5 py-3 border-b bg-gray-50 flex items-center justify-between">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Course Record</p>
                        <span className="text-xs text-gray-400">{extracted.courses.length} courses</span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b bg-gray-50/50">
                              <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Course</th>
                              <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 hidden sm:table-cell">Number</th>
                              <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 hidden md:table-cell">Term</th>
                              <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-500">Credits</th>
                              <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-500">Grade</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50">
                            {extracted.courses.map((c, i) => {
                              const isFailing = ['F', 'D', 'W', 'WF'].includes(c.grade?.toUpperCase());
                              return (
                                <tr key={i} className={`hover:bg-gray-50 ${isFailing ? 'bg-red-50/40' : ''}`}>
                                  <td className="px-4 py-2.5 font-medium text-gray-800 max-w-[180px] truncate" title={c.name}>{c.name}</td>
                                  <td className="px-4 py-2.5 text-gray-500 hidden sm:table-cell">{c.number}</td>
                                  <td className="px-4 py-2.5 text-gray-500 hidden md:table-cell">{c.term}</td>
                                  <td className="px-4 py-2.5 text-center text-gray-700">{c.credits}</td>
                                  <td className="px-4 py-2.5 text-center">
                                    <span className={`inline-block font-bold text-xs px-2 py-0.5 rounded-full ${
                                      isFailing ? 'bg-red-100 text-red-700' :
                                      ['A', 'A+', 'A-'].includes(c.grade?.toUpperCase()) ? 'bg-green-100 text-green-700' :
                                      'bg-gray-100 text-gray-700'
                                    }`}>{c.grade}</span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Transfer credits */}
                  {extracted.transfer_credits?.length > 0 && (
                    <div className="bg-white rounded-xl border shadow-sm p-5">
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Transfer Credits</p>
                      {extracted.transfer_credits.map((tc, i) => (
                        <div key={i} className="mb-3 last:mb-0">
                          <p className="text-sm font-medium text-gray-700 mb-1">{tc.institution}</p>
                          <div className="flex flex-wrap gap-2">
                            {tc.courses.map((c, j) => (
                              <span key={j} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                                {c.name} ({c.credits} cr, {c.grade})
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Source citations from verification */}
                  {verification?.sourceCitations && verification.sourceCitations.length > 0 && (
                    <div className="bg-white rounded-xl border shadow-sm p-5">
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">AI Source Citations</p>
                      <div className="space-y-2">
                        {verification.sourceCitations.map((cite, i) => (
                          <div key={i} className="flex gap-2.5 p-3 bg-blue-50 border border-blue-100 rounded-lg">
                            <svg className="w-3.5 h-3.5 text-blue-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h10M7 11h10M7 15h4" />
                            </svg>
                            <p className="text-xs text-blue-800 leading-relaxed">{cite}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── TAB: AI ANALYSIS ── */}
          {rightTab === 'analysis' && (
            <div className="space-y-4">
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

            </div>
          )}

          {/* ── TAB: REVIEW & SUBMIT ── */}
          {rightTab === 'review' && (
            <div className="space-y-4">

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
          )}

        </div>
      </div>
    </div>
  );
}
