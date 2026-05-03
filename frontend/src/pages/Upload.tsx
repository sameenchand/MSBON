import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';

const PIPELINE_STEPS = [
  { icon: '☁', label: 'Transcript PDF uploaded securely to S3' },
  { icon: '🔍', label: 'Textract OCR extracts all text and tables' },
  { icon: '🤖', label: 'Nova Pro structures courses, grades, and dates' },
  { icon: '✓', label: '18 deterministic rules fire automatically' },
  { icon: '🧠', label: 'Nova Pro performs holistic fraud analysis' },
  { icon: '📋', label: 'Results ready for your human review' },
];

export default function Upload() {
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);

  const handleFile = useCallback((f: File) => {
    if (f.type !== 'application/pdf') { setError('Please upload a PDF file.'); return; }
    setFile(f);
    setError('');
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, [handleFile]);

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const { transcriptId } = await api.uploadTranscript(file);
      await new Promise((r) => setTimeout(r, 600));
      navigate(`/transcript/${transcriptId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
      setUploading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      {/* Page header */}
      <div className="mb-8">
        <h2 className="text-3xl font-extrabold text-gray-900 dark:text-white">Upload Transcript</h2>
        <p className="text-gray-500 dark:text-gray-400 mt-2">
          Upload a nursing school transcript PDF. The AI pipeline starts automatically.
        </p>
      </div>

      <div className="grid md:grid-cols-[1fr_280px] gap-6">
        {/* Left: upload zone */}
        <div className="space-y-4">
          {/* Drop zone */}
          <div
            className={`relative rounded-2xl border-2 border-dashed transition-all cursor-pointer ${
              dragOver
                ? 'border-msbon-500 bg-msbon-50 dark:bg-msbon-900/20 scale-[1.01]'
                : file
                ? 'border-green-400 bg-green-50 dark:bg-green-900/10 dark:border-green-600'
                : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 hover:border-msbon-400 hover:bg-msbon-50/30 dark:hover:bg-gray-800'
            }`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => !file && document.getElementById('file-input')?.click()}
          >
            <input
              id="file-input"
              type="file"
              accept=".pdf"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            />

            <div className="p-12 text-center">
              {file ? (
                <>
                  <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <p className="text-lg font-semibold text-gray-900 dark:text-white">{file.name}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{(file.size / 1024).toFixed(1)} KB · PDF</p>
                  <button
                    onClick={(e) => { e.stopPropagation(); setFile(null); }}
                    className="mt-4 text-sm text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 font-medium"
                  >
                    Remove file
                  </button>
                </>
              ) : (
                <>
                  <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                  </div>
                  <p className="text-base font-semibold text-gray-700 dark:text-gray-200">
                    Drag & drop your transcript PDF
                  </p>
                  <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">or click to browse</p>
                  <p className="text-xs text-gray-400 dark:text-gray-600 mt-3">PDF only · Max 5 MB</p>
                </>
              )}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2.5 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-sm text-red-700 dark:text-red-400">
              <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              {error}
            </div>
          )}

          {/* Upload button */}
          {file && (
            <button
              onClick={handleUpload}
              disabled={uploading}
              className="w-full flex items-center justify-center gap-2.5 px-6 py-4 bg-msbon-700 hover:bg-msbon-800 dark:bg-msbon-600 dark:hover:bg-msbon-700 text-white font-bold rounded-xl transition-all disabled:opacity-60 disabled:cursor-not-allowed shadow-lg shadow-msbon-900/20 text-sm"
            >
              {uploading ? (
                <>
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                  Uploading & starting pipeline…
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Upload & Start Verification
                </>
              )}
            </button>
          )}
        </div>

        {/* Right: what happens next */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl p-5 shadow-sm h-fit">
          <p className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-4">What happens next</p>
          <ol className="space-y-3">
            {PIPELINE_STEPS.map((step, i) => (
              <li key={i} className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-lg bg-msbon-50 dark:bg-msbon-900/30 border border-msbon-100 dark:border-msbon-800 flex items-center justify-center flex-shrink-0 text-xs font-bold text-msbon-700 dark:text-msbon-400">
                  {i + 1}
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400 leading-tight mt-0.5">{step.label}</p>
              </li>
            ))}
          </ol>
          <div className="mt-5 pt-4 border-t border-gray-100 dark:border-gray-800">
            <p className="text-xs text-gray-400 dark:text-gray-500 leading-relaxed">
              Results are advisory only. Staff must review all AI findings before any decision.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
