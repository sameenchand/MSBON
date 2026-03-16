import type { RuleResult } from '../types';

const statusIcon: Record<string, string> = {
  PASS: 'text-green-500',
  FLAG: 'text-red-500',
  UNABLE_TO_DETERMINE: 'text-yellow-500',
};

const statusSymbol: Record<string, string> = {
  PASS: '\u2713',
  FLAG: '\u2717',
  UNABLE_TO_DETERMINE: '?',
};

const confidenceLabel: Record<string, string> = {
  HIGH: 'High confidence',
  MEDIUM: 'Medium confidence',
  LOW: 'Low confidence',
};

function formatRuleId(ruleId: string): string {
  return ruleId
    .replace(/^check_/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function FlagCard({ result }: { result: RuleResult }) {
  const borderColor =
    result.status === 'FLAG'
      ? 'border-red-300 bg-red-50'
      : result.status === 'PASS'
        ? 'border-green-200 bg-green-50'
        : 'border-yellow-200 bg-yellow-50';

  return (
    <div className={`border rounded-lg p-4 ${borderColor}`}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <span className={`text-lg font-bold ${statusIcon[result.status]}`}>
            {statusSymbol[result.status]}
          </span>
          <h4 className="font-medium text-gray-900">{formatRuleId(result.ruleId)}</h4>
        </div>
        <span className="text-xs text-gray-500">{confidenceLabel[result.confidence]}</span>
      </div>
      <p className="mt-2 text-sm text-gray-700">{result.explanation}</p>
      {result.sourceSection && (
        <p className="mt-1 text-xs text-gray-500">Source: {result.sourceSection}</p>
      )}
    </div>
  );
}
