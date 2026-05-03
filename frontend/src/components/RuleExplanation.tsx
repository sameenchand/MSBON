import type { RuleResult } from '../types';

interface Props {
  results: RuleResult[];
}

export default function RuleExplanation({ results }: Props) {
  const passed = results.filter((r) => r.status === 'PASS').length;
  const flagged = results.filter((r) => r.status === 'FLAG').length;
  const undetermined = results.filter((r) => r.status === 'UNABLE_TO_DETERMINE').length;
  const total = results.length;

  const flagPct = total > 0 ? (flagged / total) * 100 : 0;
  const passPct = total > 0 ? (passed / total) * 100 : 0;
  const unkPct = total > 0 ? (undetermined / total) * 100 : 0;

  return (
    <div className="bg-white rounded-xl border shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-900">Verification Summary</h3>
        <span className="text-xs text-gray-400">{total} checks run</span>
      </div>

      {/* Segmented bar */}
      <div className="flex rounded-full overflow-hidden h-3 mb-5 gap-px bg-gray-100">
        {flagPct > 0 && (
          <div className="bg-red-500 transition-all" style={{ width: `${flagPct}%` }} title={`${flagged} flagged`} />
        )}
        {passPct > 0 && (
          <div className="bg-green-500 transition-all" style={{ width: `${passPct}%` }} title={`${passed} passed`} />
        )}
        {unkPct > 0 && (
          <div className="bg-amber-400 transition-all" style={{ width: `${unkPct}%` }} title={`${undetermined} undetermined`} />
        )}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="text-center p-3 bg-red-50 rounded-xl border border-red-100">
          <div className="text-3xl font-bold text-red-600 leading-none">{flagged}</div>
          <div className="text-xs text-red-500 mt-1 font-medium">Flagged</div>
        </div>
        <div className="text-center p-3 bg-green-50 rounded-xl border border-green-100">
          <div className="text-3xl font-bold text-green-600 leading-none">{passed}</div>
          <div className="text-xs text-green-500 mt-1 font-medium">Passed</div>
        </div>
        <div className="text-center p-3 bg-amber-50 rounded-xl border border-amber-100">
          <div className="text-3xl font-bold text-amber-600 leading-none">{undetermined}</div>
          <div className="text-xs text-amber-500 mt-1 font-medium">Undetermined</div>
        </div>
      </div>

      {flagged > 0 && (
        <p className="mt-4 text-xs text-gray-500 flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5 text-red-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          {flagged} flagged item{flagged !== 1 ? 's' : ''} require human review before any action is taken.
        </p>
      )}
    </div>
  );
}
