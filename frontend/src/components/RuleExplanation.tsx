import type { RuleResult } from '../types';

interface Props {
  results: RuleResult[];
}

export default function RuleExplanation({ results }: Props) {
  const passed = results.filter((r) => r.status === 'PASS');
  const flagged = results.filter((r) => r.status === 'FLAG');
  const undetermined = results.filter((r) => r.status === 'UNABLE_TO_DETERMINE');

  return (
    <div className="bg-white rounded-lg border p-4">
      <h3 className="text-lg font-semibold mb-3">Verification Summary</h3>
      <div className="grid grid-cols-3 gap-4 mb-4">
        <div className="text-center p-3 bg-green-50 rounded-lg">
          <div className="text-2xl font-bold text-green-700">{passed.length}</div>
          <div className="text-sm text-green-600">Passed</div>
        </div>
        <div className="text-center p-3 bg-red-50 rounded-lg">
          <div className="text-2xl font-bold text-red-700">{flagged.length}</div>
          <div className="text-sm text-red-600">Flagged</div>
        </div>
        <div className="text-center p-3 bg-yellow-50 rounded-lg">
          <div className="text-2xl font-bold text-yellow-700">{undetermined.length}</div>
          <div className="text-sm text-yellow-600">Undetermined</div>
        </div>
      </div>
      <div className="text-sm text-gray-600">
        <p>
          {results.length} rules were applied to this transcript.
          {flagged.length > 0 && ' Items flagged require human review.'}
        </p>
      </div>
    </div>
  );
}
