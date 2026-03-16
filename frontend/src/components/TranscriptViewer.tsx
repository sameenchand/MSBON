import type { ExtractedTranscript } from '../types';

interface Props {
  data: ExtractedTranscript;
}

export default function TranscriptViewer({ data }: Props) {
  return (
    <div className="bg-white rounded-lg border p-4 space-y-4">
      <h3 className="text-lg font-semibold">Extracted Transcript Data</h3>

      {/* Institution & Program Info */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-medium text-gray-500 uppercase">Institution(s)</label>
          <p className="text-sm">{data.institutions.join(', ') || 'Not identified'}</p>
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500 uppercase">Program</label>
          <p className="text-sm">{data.program_name || 'Not identified'} ({data.program_type || 'N/A'})</p>
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500 uppercase">Graduation</label>
          <p className="text-sm">
            {data.graduation_confirmed ? 'Confirmed' : 'Not confirmed'}
            {data.graduation_date ? ` - ${data.graduation_date}` : ''}
          </p>
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500 uppercase">Total Credits</label>
          <p className="text-sm">{data.total_credit_hours || 'N/A'} hours</p>
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500 uppercase">Cumulative GPA</label>
          <p className="text-sm">{data.gpa_info?.cumulative || 'N/A'}</p>
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500 uppercase">Degree Conferral</label>
          <p className="text-sm">{data.degree_conferral || 'Not found'}</p>
        </div>
      </div>

      {/* Course List */}
      {data.courses.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-gray-700 mb-2">Courses ({data.courses.length})</h4>
          <div className="max-h-64 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="text-left px-2 py-1">Course</th>
                  <th className="text-left px-2 py-1">Name</th>
                  <th className="text-center px-2 py-1">Credits</th>
                  <th className="text-center px-2 py-1">Grade</th>
                  <th className="text-left px-2 py-1">Term</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.courses.map((course, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-2 py-1 font-mono text-xs">{course.number}</td>
                    <td className="px-2 py-1">{course.name}</td>
                    <td className="px-2 py-1 text-center">{course.credits}</td>
                    <td className={`px-2 py-1 text-center font-medium ${
                      ['F', 'WF', 'FA'].includes(course.grade) ? 'text-red-600' : ''
                    }`}>
                      {course.grade}
                    </td>
                    <td className="px-2 py-1 text-xs text-gray-500">{course.term}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Transfer Credits */}
      {data.transfer_credits.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-gray-700 mb-2">Transfer Credits</h4>
          {data.transfer_credits.map((tc, i) => (
            <div key={i} className="mb-2">
              <p className="text-xs font-medium text-gray-500">{tc.institution}</p>
              <p className="text-sm">{tc.courses.length} courses transferred</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
