import { useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../services/api';
import { StatusBadge, RiskBadge } from '../components/StatusBadge';
import FlagCard from '../components/FlagCard';
import RuleExplanation from '../components/RuleExplanation';
import TranscriptViewer from '../components/TranscriptViewer';
import type { Transcript, Verification, ExtractedTranscript } from '../types';

const PROCESSING_STATUSES = new Set(['UPLOADED', 'EXTRACTING', 'VERIFYING', 'REPORTING']);

const PIPELINE_STEPS = [
  { status: 'UPLOADED', label: 'Transcript uploaded' },
  { status: 'EXTRACTING', label: 'Extracting text & courses (OCR)' },
  { status: 'VERIFYING', label: 'Running verification rules + AI analysis' },
  { status: 'REPORTING', label: 'Generating report' },
];

function ProcessingIndicator({ status }: { status: string }) {
  const currentIdx = PIPELINE_STEPS.findIndex((s) => s.status === status);
  return (
    <div className="bg-white rounded-lg border p-8">
      <div className="flex items-center gap-3 mb-6">
        <svg className="animate-spin h-6 w-6 text-msbon-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
        </svg>
        <span className="text-lg font-semibold text-gray-800">Verification in progress…</span>
      </div>
      <ol className="space-y-3">
        {PIPELINE_STEPS.map((step, i) => {
          const done = i < currentIdx;
          const active = i === currentIdx;
          return (
            <li key={step.status} className="flex items-center gap-3">
              {done ? (
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-green-500 flex items-center justify-center text-white text-xs">✓</span>
              ) : active ? (
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-msbon-500 flex items-center justify-center">
                  <svg className="animate-spin h-3 w-3 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                </span>
              ) : (
                <span className="flex-shrink-0 w-6 h-6 rounded-full border-2 border-gray-300" />
              )}
              <span className={`text-sm ${done ? 'text-green-700 font-medium' : active ? 'text-msbon-700 font-semibold' : 'text-gray-400'}`}>
                {step.label}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="mt-5 text-xs text-gray-400">This page checks automatically every 5 seconds — no need to refresh.</p>
    </div>
  );
}

export default function VerificationDetail() {
  const { id } = useParams<{ id: string }>();
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [verification, setVerification] = useState<Verification | null>(null);
  const [_extractedData] = useState<ExtractedTranscript | null>(null);
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
        // Stop polling once the pipeline finishes
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

  if (loading) return <div className="text-center py-12 text-gray-500">Loading...</div>;
  if (error) return <div className="text-center py-12 text-red-500">Error: {error}</div>;
  if (!transcript) return <div className="text-center py-12 text-gray-500">Transcript not found.</div>;

  const flagged = verification?.ruleResults.filter((r) => r.status === 'FLAG') || [];
  const passed = verification?.ruleResults.filter((r) => r.status === 'PASS') || [];

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link to="/dashboard" className="text-sm text-msbon-600 hover:text-msbon-800 mb-1 inline-block">
            &larr; Back to Dashboard
          </Link>
          <h2 className="text-2xl font-bold text-gray-900">{transcript.fileName}</h2>
          <div className="flex items-center gap-3 mt-2">
            <StatusBadge status={transcript.status} />
            {verification && <RiskBadge level={verification.riskLevel} />}
            {verification && <StatusBadge status={verification.overallStatus} />}
          </div>
        </div>
        <div className="flex gap-2">
          <Link
            to={`/transcript/${id}/review`}
            className="px-4 py-2 bg-msbon-600 text-white rounded-lg hover:bg-msbon-700"
          >
            Start Review
          </Link>
          {!PROCESSING_STATUSES.has(transcript.status) && transcript.status !== 'APPROVED' && (
            <button
              onClick={handleRerun}
              disabled={rerunning}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              {rerunning ? 'Starting…' : 'Re-run Verification'}
            </button>
          )}
          <Link
            to={`/transcript/${id}/audit`}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
          >
            Audit Log
          </Link>
        </div>
      </div>

      {verification ? (
        <div className="space-y-6">
          {/* Summary */}
          <RuleExplanation results={verification.ruleResults} />

          {/* AI Analysis */}
          {verification.aiAnalysis && (
            <div className="bg-white rounded-lg border p-4">
              <h3 className="text-lg font-semibold mb-3">AI Analysis</h3>
              <p className="text-sm text-gray-700 mb-3">{verification.aiAnalysis.summary}</p>
              {verification.aiAnalysis.recommendation && (
                <div className="bg-blue-50 border border-blue-200 rounded p-3 mt-2">
                  <p className="text-sm font-medium text-blue-800">Recommendation</p>
                  <p className="text-sm text-blue-700">{verification.aiAnalysis.recommendation}</p>
                </div>
              )}
              {verification.aiAnalysis.reasoning && (
                <div className="mt-3">
                  <p className="text-xs font-medium text-gray-500 uppercase mb-1">Reasoning</p>
                  <p className="text-sm text-gray-600">{verification.aiAnalysis.reasoning}</p>
                </div>
              )}
              {verification.aiAnalysis.additionalFlags.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs font-medium text-gray-500 uppercase mb-1">Additional Flags</p>
                  <ul className="space-y-2 mt-1">
                    {verification.aiAnalysis.additionalFlags.map((flag, i) => (
                      <li key={i} className="text-sm border border-red-200 rounded p-2 bg-red-50">
                        <span className="font-medium text-red-700">[{flag.severity}]</span>{' '}
                        <span className="text-gray-800">{flag.issue}</span>
                        {flag.details && (
                          <p className="text-xs text-gray-500 mt-1">{flag.details}</p>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Flagged Items */}
          {flagged.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold mb-3 text-red-700">
                Flagged Items ({flagged.length})
              </h3>
              <div className="space-y-3">
                {flagged.map((r) => (
                  <FlagCard key={r.ruleId} result={r} />
                ))}
              </div>
            </div>
          )}

          {/* Passed Items */}
          {passed.length > 0 && (
            <details className="bg-white rounded-lg border">
              <summary className="px-4 py-3 cursor-pointer text-sm font-medium text-gray-700 hover:bg-gray-50">
                Passed Checks ({passed.length}) - Click to expand
              </summary>
              <div className="px-4 pb-4 space-y-3">
                {passed.map((r) => (
                  <FlagCard key={r.ruleId} result={r} />
                ))}
              </div>
            </details>
          )}

          {/* Extracted Data */}
          {_extractedData && <TranscriptViewer data={_extractedData} />}
        </div>
      ) : PROCESSING_STATUSES.has(transcript.status) ? (
        <ProcessingIndicator status={transcript.status} />
      ) : (
        <div className="bg-white rounded-lg border p-8 text-center">
          <p className="text-gray-500">No verification results available yet.</p>
        </div>
      )}
    </div>
  );
}
