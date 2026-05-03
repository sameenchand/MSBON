import { useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../services/api';
import { StatusBadge, RiskBadge } from '../components/StatusBadge';
import FlagCard from '../components/FlagCard';
import RuleExplanation from '../components/RuleExplanation';
import type { Transcript, Verification } from '../types';

const PROCESSING_STATUSES = new Set(['UPLOADED', 'EXTRACTING', 'VERIFYING', 'REPORTING']);

const PIPELINE_STEPS = [
  { status: 'UPLOADED',   label: 'Transcript uploaded' },
  { status: 'EXTRACTING', label: 'OCR extraction' },
  { status: 'VERIFYING',  label: 'AI verification' },
  { status: 'REPORTING',  label: 'Report generation' },
];

function ProcessingIndicator({ status }: { status: string }) {
  const currentIdx = PIPELINE_STEPS.findIndex((s) => s.status === status);
  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-8">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-xl bg-msbon-50 dark:bg-msbon-900/30 flex items-center justify-center">
          <svg className="animate-spin h-5 w-5 text-msbon-600 dark:text-msbon-400" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
        </div>
        <div>
          <p className="font-bold text-gray-900 dark:text-white">Verification in progress</p>
          <p className="text-sm text-gray-500 dark:text-gray-400">Auto-refreshing every 5 seconds</p>
        </div>
      </div>

      <div className="relative">
        {/* Connecting line */}
        <div className="absolute left-4 top-4 bottom-4 w-px bg-gray-200 dark:bg-gray-700" />
        <ol className="space-y-5 relative">
          {PIPELINE_STEPS.map((step, i) => {
            const done = i < currentIdx;
            const active = i === currentIdx;
            return (
              <li key={step.status} className="flex items-center gap-4">
                <div className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 border-2 transition-all ${
                  done   ? 'bg-green-500 border-green-500' :
                  active ? 'bg-msbon-600 border-msbon-600 shadow-lg shadow-msbon-500/30' :
                           'bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600'
                }`}>
                  {done ? (
                    <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  ) : active ? (
                    <svg className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                    </svg>
                  ) : (
                    <span className="w-2 h-2 rounded-full bg-gray-300 dark:bg-gray-600" />
                  )}
                </div>
                <span className={`text-sm font-medium ${
                  done   ? 'text-green-600 dark:text-green-400' :
                  active ? 'text-msbon-700 dark:text-msbon-300' :
                           'text-gray-400 dark:text-gray-600'
                }`}>
                  {step.label}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

export default function VerificationDetail() {
  const { id } = useParams<{ id: string }>();
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [verification, setVerification] = useState<Verification | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rerunning, setRerunning] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = (isInitial = false) => {
    if (!id) return;
    Promise.all([
      api.getTranscript(id),
      api.getVerification(id).catch(() => [] as Verification[]),
    ])
      .then(([t, verifications]) => {
        setTranscript(t);
        if (verifications.length > 0) setVerification(verifications[0]);
        if (!PROCESSING_STATUSES.has(t.status) && pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => { if (isInitial) setLoading(false); });
  };

  const handleRerun = () => {
    if (!id || rerunning) return;
    setRerunning(true);
    setVerification(null);
    api.triggerVerification(id)
      .then(() => {
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = setInterval(() => fetchData(false), 5000);
        fetchData(false);
      })
      .catch((e) => setError(e.message))
      .finally(() => setRerunning(false));
  };

  useEffect(() => {
    fetchData(true);
    pollRef.current = setInterval(() => fetchData(false), 5000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-msbon-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500 dark:text-gray-400 text-sm">Loading transcript…</p>
        </div>
      </div>
    );
  }
  if (error) return <div className="text-center py-12 text-red-500">{error}</div>;
  if (!transcript) return <div className="text-center py-12 text-gray-500 dark:text-gray-400">Transcript not found.</div>;

  const flagged       = verification?.ruleResults.filter((r) => r.status === 'FLAG') || [];
  const undetermined  = verification?.ruleResults.filter((r) => r.status === 'UNABLE_TO_DETERMINE') || [];
  const passed        = verification?.ruleResults.filter((r) => r.status === 'PASS') || [];

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-8">
        <div className="min-w-0">
          <Link to="/dashboard" className="inline-flex items-center gap-1 text-sm text-msbon-600 dark:text-msbon-400 hover:text-msbon-800 dark:hover:text-msbon-300 mb-2">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Dashboard
          </Link>
          <h2 className="text-2xl font-extrabold text-gray-900 dark:text-white break-words">{transcript.fileName}</h2>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <StatusBadge status={transcript.status} />
            {verification && <RiskBadge level={verification.riskLevel} />}
            {verification && <StatusBadge status={verification.overallStatus} />}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 flex-shrink-0">
          <Link
            to={`/transcript/${id}/review`}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-msbon-700 dark:bg-msbon-600 text-white rounded-xl hover:bg-msbon-800 dark:hover:bg-msbon-700 text-sm font-semibold shadow-sm transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            Start Review
          </Link>
          {!PROCESSING_STATUSES.has(transcript.status) && transcript.status !== 'APPROVED' && (
            <button
              onClick={handleRerun}
              disabled={rerunning}
              className="px-4 py-2.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 text-sm font-medium transition-colors"
            >
              {rerunning ? 'Starting…' : 'Re-run Pipeline'}
            </button>
          )}
          <Link
            to={`/transcript/${id}/audit`}
            className="px-4 py-2.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 text-sm font-medium transition-colors"
          >
            Audit Log
          </Link>
        </div>
      </div>

      {/* Transcript metadata card */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'School', value: transcript.schoolName || '—' },
          { label: 'Program', value: transcript.programType || '—' },
          { label: 'Uploaded', value: new Date(transcript.uploadDate).toLocaleDateString() },
          { label: 'Status', value: transcript.status },
        ].map(({ label, value }) => (
          <div key={label} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-4 shadow-sm">
            <p className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wide font-semibold mb-1">{label}</p>
            <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{value}</p>
          </div>
        ))}
      </div>

      {/* Rule result summary strip (only when verification exists) */}
      {verification && (
        <div className="flex flex-wrap gap-3 mb-6">
          <div className="flex items-center gap-2 px-4 py-2.5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
            <span className="text-lg font-extrabold text-red-600 dark:text-red-400">{flagged.length}</span>
            <span className="text-xs font-semibold text-red-700 dark:text-red-400">Flagged</span>
          </div>
          {undetermined.length > 0 && (
            <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl">
              <span className="text-lg font-extrabold text-amber-600 dark:text-amber-400">{undetermined.length}</span>
              <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">Unable to Determine</span>
            </div>
          )}
          <div className="flex items-center gap-2 px-4 py-2.5 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl">
            <span className="text-lg font-extrabold text-green-600 dark:text-green-400">{passed.length}</span>
            <span className="text-xs font-semibold text-green-700 dark:text-green-400">Passed</span>
          </div>
        </div>
      )}

      {verification ? (
        <div className="space-y-6">
          <RuleExplanation results={verification.ruleResults} />

          {/* AI Analysis */}
          {verification.aiAnalysis && (
            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
              <div className="bg-gradient-to-r from-msbon-900 to-msbon-700 px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-blue-300" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3z" />
                  </svg>
                  <span className="text-sm font-bold text-white">AI Analysis — Nova Pro</span>
                </div>
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                  verification.aiAnalysis.recommendation === 'APPROVE' ? 'bg-green-400/20 text-green-300' :
                  verification.aiAnalysis.recommendation === 'ESCALATE' ? 'bg-red-400/20 text-red-300' :
                  'bg-yellow-400/20 text-yellow-300'
                }`}>
                  {verification.aiAnalysis.recommendation}
                </span>
              </div>
              <div className="p-6 space-y-4">
                <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{verification.aiAnalysis.summary}</p>
                {verification.aiAnalysis.reasoning && (
                  <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4 border-l-4 border-msbon-500">
                    <p className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">Reasoning</p>
                    <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{verification.aiAnalysis.reasoning}</p>
                  </div>
                )}
                {verification.aiAnalysis.additionalFlags.length > 0 && (
                  <div>
                    <p className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">Additional AI Flags</p>
                    <div className="space-y-2">
                      {verification.aiAnalysis.additionalFlags.map((flag, i) => (
                        <div key={i} className="flex gap-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 rounded-xl">
                          <span className={`text-xs font-bold px-1.5 py-0.5 rounded self-start ${
                            flag.severity === 'HIGH' ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400' :
                            'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400'
                          }`}>{flag.severity}</span>
                          <div>
                            <p className="text-sm font-medium text-gray-900 dark:text-white">{flag.issue}</p>
                            {flag.details && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{flag.details}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Flagged items */}
          {flagged.length > 0 && (
            <div>
              <h3 className="flex items-center gap-2 text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-4">
                <span className="w-5 h-5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-xs flex items-center justify-center font-bold">{flagged.length}</span>
                Flagged Items
              </h3>
              <div className="space-y-3">
                {flagged.map((r) => <FlagCard key={r.ruleId} result={r} />)}
              </div>
            </div>
          )}

          {/* Undetermined items */}
          {undetermined.length > 0 && (
            <div>
              <h3 className="flex items-center gap-2 text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-4">
                <span className="w-5 h-5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 text-xs flex items-center justify-center font-bold">{undetermined.length}</span>
                Unable to Determine
              </h3>
              <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-2.5 mb-3">
                The AI could not make a definitive determination on the following checks due to missing, ambiguous, or unclear information in the transcript. Human review is required.
              </p>
              <div className="space-y-3">
                {undetermined.map((r) => <FlagCard key={r.ruleId} result={r} />)}
              </div>
            </div>
          )}

          {/* Passed items */}
          {passed.length > 0 && (
            <details className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm group">
              <summary className="px-5 py-4 cursor-pointer select-none flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-2xl transition-colors">
                <span className="w-5 h-5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 text-xs flex items-center justify-center font-bold">{passed.length}</span>
                Passed Checks — click to expand
              </summary>
              <div className="px-5 pb-5 pt-2 space-y-3">
                {passed.map((r) => <FlagCard key={r.ruleId} result={r} />)}
              </div>
            </details>
          )}

          {/* CTA to review */}
          <div className="bg-gradient-to-br from-msbon-800 to-msbon-900 rounded-2xl p-6 text-white text-center">
            <p className="font-bold text-lg mb-2">Ready to review these findings?</p>
            <p className="text-blue-200 text-sm mb-5">Open the review workspace to confirm, override, or annotate each AI finding.</p>
            <Link
              to={`/transcript/${id}/review`}
              className="inline-flex items-center gap-2 px-6 py-3 bg-white text-msbon-900 font-bold rounded-xl hover:bg-blue-50 transition-colors text-sm shadow-lg"
            >
              Open Review Workspace
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
        </div>
      ) : PROCESSING_STATUSES.has(transcript.status) ? (
        <ProcessingIndicator status={transcript.status} />
      ) : (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-12 text-center">
          <p className="text-gray-500 dark:text-gray-400">No verification results yet.</p>
        </div>
      )}
    </div>
  );
}
