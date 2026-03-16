import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import { StatusBadge } from '../components/StatusBadge';
import type { Transcript } from '../types';

export default function Dashboard() {
  const [transcripts, setTranscripts] = useState<Transcript[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .listTranscripts()
      .then(setTranscripts)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-center py-12 text-gray-500">Loading transcripts...</div>;
  if (error) return <div className="text-center py-12 text-red-500">Error: {error}</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Transcript Dashboard</h2>
        <Link
          to="/upload"
          className="px-4 py-2 bg-msbon-600 text-white rounded-lg hover:bg-msbon-700 transition-colors"
        >
          Upload Transcript
        </Link>
      </div>

      {transcripts.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg border">
          <p className="text-gray-500 mb-4">No transcripts uploaded yet.</p>
          <Link
            to="/upload"
            className="px-4 py-2 bg-msbon-600 text-white rounded-lg hover:bg-msbon-700"
          >
            Upload Your First Transcript
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-lg border overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">File</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">School</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Program</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Status</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Uploaded</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {transcripts.map((t) => (
                <tr key={t.transcriptId} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm">{t.fileName || 'Unknown'}</td>
                  <td className="px-4 py-3 text-sm">{t.schoolName || '-'}</td>
                  <td className="px-4 py-3 text-sm">{t.programType || '-'}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={t.status} />
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {new Date(t.uploadDate).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      to={`/transcript/${t.transcriptId}`}
                      className="text-sm text-msbon-600 hover:text-msbon-800 font-medium"
                    >
                      View Details
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
