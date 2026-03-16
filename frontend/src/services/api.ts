import type { Transcript, Verification, ReviewAction, AuditEntry } from '../types';

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
  listTranscripts: () => request<Transcript[]>('/transcripts'),

  getTranscript: (id: string) => request<Transcript>(`/transcripts/${id}`),

  uploadTranscript: (file: File) => {
    return request<{ transcriptId: string; uploadUrl: string }>('/transcripts', {
      method: 'POST',
      body: JSON.stringify({ fileName: file.name, contentType: file.type }),
    }).then(async (data) => {
      // Upload file to S3 using presigned URL
      await fetch(data.uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type },
      });
      return data;
    });
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
    request<ReviewAction[]>(`/reviews/${transcriptId}`),

  // Audit
  getAuditLog: (transcriptId: string) =>
    request<AuditEntry[]>(`/audit/${transcriptId}`),
};
