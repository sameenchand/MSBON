import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../services/api';
import { StatusBadge, RiskBadge } from '../components/StatusBadge';
import FlagCard from '../components/FlagCard';
import RuleExplanation from '../components/RuleExplanation';
import TranscriptViewer from '../components/TranscriptViewer';
import type { Transcript, Verification, ExtractedTranscript } from '../types';

export default function VerificationDetail() {
  const { id } = useParams<{ id: string }>();
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [verification, setVerification] = useState<Verification | null>(null);
  const [_extractedData, setExtractedData] = useState<ExtractedTranscript | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    Promise.all([
      api.getTranscript(id),
      api.getVerification(id).catch(() => []),
    ])
      .then(([t, verifications]) => {
        setTranscript(t);
        if (verifications.length > 0) {
          setVerification(verifications[0]);
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
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
          <Link to="/" className="text-sm text-msbon-600 hover:text-msbon-800 mb-1 inline-block">
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
                  <ul className="list-disc list-inside text-sm text-red-700">
                    {verification.aiAnalysis.additionalFlags.map((flag, i) => (
                      <li key={i}>{flag}</li>
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
      ) : (
        <div className="bg-white rounded-lg border p-8 text-center">
          <p className="text-gray-500">
            {transcript.status === 'UPLOADED' || transcript.status === 'EXTRACTING'
              ? 'Verification is in progress. Refresh to check status.'
              : 'No verification results available yet.'}
          </p>
        </div>
      )}
    </div>
  );
}
