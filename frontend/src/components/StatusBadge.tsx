import type { TranscriptStatus } from '../types';

const statusConfig: Record<string, { label: string; color: string }> = {
  UPLOADED: { label: 'Uploaded', color: 'bg-gray-100 text-gray-700' },
  EXTRACTING: { label: 'Extracting', color: 'bg-blue-100 text-blue-700' },
  EXTRACTED: { label: 'Extracted', color: 'bg-blue-100 text-blue-700' },
  VERIFYING: { label: 'Verifying', color: 'bg-yellow-100 text-yellow-700' },
  VERIFIED: { label: 'Verified', color: 'bg-green-100 text-green-700' },
  REVIEW_REQUIRED: { label: 'Review Required', color: 'bg-red-100 text-red-700' },
  REVIEWED: { label: 'Reviewed', color: 'bg-purple-100 text-purple-700' },
  APPROVED: { label: 'Approved', color: 'bg-green-100 text-green-800' },
  NEEDS_FOLLOW_UP: { label: 'Needs Follow-Up', color: 'bg-orange-100 text-orange-700' },
  CLEAR: { label: 'Clear', color: 'bg-green-100 text-green-700' },
  FLAGS_FOUND: { label: 'Flags Found', color: 'bg-red-100 text-red-700' },
};

const riskConfig: Record<string, { color: string }> = {
  LOW: { color: 'bg-green-100 text-green-700' },
  MEDIUM: { color: 'bg-yellow-100 text-yellow-700' },
  HIGH: { color: 'bg-red-100 text-red-700' },
};

export function StatusBadge({ status }: { status: TranscriptStatus | string }) {
  const config = statusConfig[status] || { label: status, color: 'bg-gray-100 text-gray-700' };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.color}`}>
      {config.label}
    </span>
  );
}

export function RiskBadge({ level }: { level: string }) {
  const config = riskConfig[level] || riskConfig.LOW;
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.color}`}>
      {level} Risk
    </span>
  );
}
