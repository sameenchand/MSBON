import type { RuleResult } from '../types';

function formatRuleId(ruleId: string): string {
  return ruleId.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

const STATUS_CONFIG = {
  FLAG: {
    bg: 'bg-red-50',
    border: 'border-red-200',
    dot: 'bg-red-500',
    icon: (
      <svg className="w-4 h-4 text-red-500" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
      </svg>
    ),
  },
  PASS: {
    bg: 'bg-green-50',
    border: 'border-green-200',
    dot: 'bg-green-500',
    icon: (
      <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
      </svg>
    ),
  },
  UNABLE_TO_DETERMINE: {
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    dot: 'bg-amber-400',
    icon: (
      <svg className="w-4 h-4 text-amber-500" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
      </svg>
    ),
  },
};

const CONFIDENCE_LABEL: Record<string, string> = {
  HIGH: 'High confidence',
  MEDIUM: 'Med confidence',
  LOW: 'Low confidence',
};

const CONFIDENCE_COLOR: Record<string, string> = {
  HIGH: 'text-gray-700 bg-gray-100',
  MEDIUM: 'text-amber-700 bg-amber-50',
  LOW: 'text-red-700 bg-red-50',
};

export default function FlagCard({ result }: { result: RuleResult }) {
  const cfg = STATUS_CONFIG[result.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.UNABLE_TO_DETERMINE;

  return (
    <div className={`rounded-xl border ${cfg.bg} ${cfg.border} overflow-hidden`}>
      <div className="flex items-center justify-between px-4 py-3 gap-3">
        <div className="flex items-center gap-2 min-w-0">
          {cfg.icon}
          <h4 className="font-semibold text-sm text-gray-900 truncate">{formatRuleId(result.ruleId)}</h4>
        </div>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${CONFIDENCE_COLOR[result.confidence] || CONFIDENCE_COLOR.MEDIUM}`}>
          {CONFIDENCE_LABEL[result.confidence] || result.confidence}
        </span>
      </div>
      <div className="px-4 pb-3">
        <p className="text-sm text-gray-700 leading-relaxed">{result.explanation}</p>
        {result.sourceSection && (
          <div className="mt-2 inline-flex items-center gap-1.5 text-xs bg-white border border-gray-200 text-gray-500 px-2 py-1 rounded-md">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h10M7 11h10M7 15h4" />
            </svg>
            {result.sourceSection}
          </div>
        )}
      </div>
    </div>
  );
}
