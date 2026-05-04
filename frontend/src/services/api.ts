import type { Transcript, Verification, ReviewAction, AuditEntry, ExtractedTranscript } from '../types';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const error = await res.text();
    throw new Error(`API error ${res.status}: ${error}`);
  }
  return res.json();
}

export const api = {
  // Transcripts
  listTranscripts: () =>
    request<{ transcripts: Transcript[] }>('/transcripts').then((r) => r.transcripts),

  getTranscript: (id: string) => request<Transcript>(`/transcripts/${id}`),

  getExtractedData: (id: string) => request<ExtractedTranscript>(`/transcripts/${id}/extracted`),

  getTranscriptPdfUrl: (id: string) =>
    request<{ url: string }>(`/transcripts/${id}/pdf`).then((r) => r.url),

  uploadTranscript: async (file: File) => {
    // Step 1: create transcript record and get presigned S3 URL
    const data = await request<{ transcriptId: string; uploadUrl: string }>('/transcripts', {
      method: 'POST',
      body: JSON.stringify({ fileName: file.name, contentType: file.type }),
    });

    // Step 2: upload file directly to S3 (file must land before pipeline starts)
    await fetch(data.uploadUrl, {
      method: 'PUT',
      body: file,
      headers: { 'Content-Type': file.type },
    });

    // Step 3: now that the file is in S3, start the verification pipeline
    await request(`/transcripts/${data.transcriptId}/verify`, { method: 'POST' });

    return data;
  },

  triggerVerification: (transcriptId: string) =>
    request<{ executionArn: string }>(`/transcripts/${transcriptId}/verify`, {
      method: 'POST',
    }),

  // Verifications
  getVerification: (transcriptId: string) =>
    request<Verification[]>(`/verifications/${transcriptId}`),

  // Reviews
  createReview: (review: Omit<ReviewAction, 'reviewId' | 'timestamp'>) =>
    request<ReviewAction>('/reviews', {
      method: 'POST',
      body: JSON.stringify(review),
    }),

  getReviews: (transcriptId: string) =>
    request<{ transcriptId: string; reviews: ReviewAction[] }>(`/reviews/${transcriptId}`)
      .then((r) => r.reviews ?? []),

  // Audit
  getAuditLog: (transcriptId: string) =>
    request<{ transcriptId: string; auditLog: AuditEntry[] }>(`/audit/${transcriptId}`)
      .then((r) => r.auditLog),
};
