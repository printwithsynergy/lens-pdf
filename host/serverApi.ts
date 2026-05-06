import type { AnnotationEntry, AnnotationService } from "../plugin/services";

export interface LoupeServerApiClientOptions {
  apiBase: string;
  bearerToken?: string;
  apiKey?: string;
  internalToken?: string;
  fetchImpl?: typeof fetch;
}

export interface GenerateViewerLinkRequest {
  viewerBaseUrl?: string;
  source?: string;
  lintpdfToken?: string;
  viewerToken?: string;
  jobId?: string;
  pdfUrl?: string;
  apiBase?: string;
  page?: number;
  zoom?: number;
  tool?: string;
  panel?: string;
  mode?: "page" | "separation" | "layer";
  extras?: Record<string, string | number | boolean>;
  expiresAt?: string;
  metadata?: Record<string, unknown>;
}

export interface GenerateViewerLinkResponse {
  viewer_url: string;
  viewer_base_url: string;
  query: Record<string, string>;
  expires_at: string | null;
  metadata: Record<string, unknown>;
}

export interface ServerAnnotationRecord extends AnnotationEntry {
  number?: number | null;
  linkedNotes?: Array<{
    id: string;
    text: string;
    createdAt: string;
    updatedAt: string;
  }>;
  metadata?: Record<string, unknown>;
}

export interface CreateAnnotationRequest {
  pageNum: number;
  authorEmail: string;
  authorName?: string | null;
  fabricJson?: unknown;
  number?: number | null;
  linkedNotes?: Array<{
    id?: string;
    text: string;
    createdAt?: string;
    updatedAt?: string;
  }>;
  metadata?: Record<string, unknown>;
}

export interface UpdateAnnotationRequest {
  pageNum?: number;
  authorEmail?: string;
  authorName?: string | null;
  fabricJson?: unknown;
  number?: number | null;
  linkedNotes?: Array<{
    id?: string;
    text: string;
    createdAt?: string;
    updatedAt?: string;
  }>;
  metadata?: Record<string, unknown>;
}

export interface LoupeServerApiClient {
  generateViewerLink(
    payload: GenerateViewerLinkRequest,
  ): Promise<GenerateViewerLinkResponse>;
  listAnnotations(jobId: string): Promise<ServerAnnotationRecord[]>;
  getAnnotation(jobId: string, annotationId: string): Promise<ServerAnnotationRecord | null>;
  createAnnotation(jobId: string, payload: CreateAnnotationRequest): Promise<ServerAnnotationRecord>;
  updateAnnotation(
    jobId: string,
    annotationId: string,
    payload: UpdateAnnotationRequest,
  ): Promise<ServerAnnotationRecord | null>;
  deleteAnnotation(jobId: string, annotationId: string): Promise<boolean>;
  getAnnotationForPage(
    jobId: string,
    pageNum: number,
    authorEmail: string,
  ): Promise<ServerAnnotationRecord | null>;
  saveAnnotationForPage(
    jobId: string,
    pageNum: number,
    payload: {
      authorEmail: string;
      authorName?: string | null;
      fabricJson: unknown;
    },
  ): Promise<ServerAnnotationRecord>;
}

export function createLoupeServerApiClient(
  options: LoupeServerApiClientOptions,
): LoupeServerApiClient {
  const base = options.apiBase.replace(/\/+$/, "");
  const fetchImpl = options.fetchImpl ?? fetch;

  const request = async <T>(
    path: string,
    init?: RequestInit,
  ): Promise<T> => {
    const headers = new Headers(init?.headers ?? {});
    if (!headers.has("content-type") && init?.body) {
      headers.set("content-type", "application/json");
    }
    if (options.bearerToken) {
      headers.set("authorization", `Bearer ${options.bearerToken}`);
    }
    if (options.apiKey) {
      headers.set("x-api-key", options.apiKey);
    }
    if (options.internalToken) {
      headers.set("x-loupe-internal-token", options.internalToken);
    }
    const response = await fetchImpl(`${base}${path}`, {
      ...init,
      headers,
    });
    if (response.status === 204) {
      return undefined as T;
    }
    const body = await response
      .json()
      .catch(() => ({ error: `Request failed (${response.status})` }));
    if (!response.ok) {
      const message =
        body && typeof body.error === "string"
          ? body.error
          : `Request failed (${response.status})`;
      throw new Error(message);
    }
    return body as T;
  };

  return {
    generateViewerLink: (payload) =>
      request<GenerateViewerLinkResponse>("/viewer-links", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    listAnnotations: (jobId) =>
      request<ServerAnnotationRecord[]>(
        `/jobs/${encodeURIComponent(jobId)}/annotations`,
      ),
    getAnnotation: async (jobId, annotationId) => {
      try {
        return await request<ServerAnnotationRecord>(
          `/jobs/${encodeURIComponent(jobId)}/annotations/${encodeURIComponent(annotationId)}`,
        );
      } catch (err) {
        if (String((err as Error).message).includes("not found")) return null;
        throw err;
      }
    },
    createAnnotation: (jobId, payload) =>
      request<ServerAnnotationRecord>(
        `/jobs/${encodeURIComponent(jobId)}/annotations`,
        {
          method: "POST",
          body: JSON.stringify(payload),
        },
      ),
    updateAnnotation: async (jobId, annotationId, payload) => {
      try {
        return await request<ServerAnnotationRecord>(
          `/jobs/${encodeURIComponent(jobId)}/annotations/${encodeURIComponent(annotationId)}`,
          {
            method: "PUT",
            body: JSON.stringify(payload),
          },
        );
      } catch (err) {
        if (String((err as Error).message).includes("not found")) return null;
        throw err;
      }
    },
    deleteAnnotation: async (jobId, annotationId) => {
      try {
        await request<void>(
          `/jobs/${encodeURIComponent(jobId)}/annotations/${encodeURIComponent(annotationId)}`,
          { method: "DELETE" },
        );
        return true;
      } catch (err) {
        if (String((err as Error).message).includes("not found")) return false;
        throw err;
      }
    },
    getAnnotationForPage: async (jobId, pageNum, authorEmail) => {
      try {
        return await request<ServerAnnotationRecord | null>(
          `/jobs/${encodeURIComponent(jobId)}/annotations/page/${pageNum}?authorEmail=${encodeURIComponent(authorEmail)}`,
        );
      } catch (err) {
        if (String((err as Error).message).includes("not found")) return null;
        throw err;
      }
    },
    saveAnnotationForPage: (jobId, pageNum, payload) =>
      request<ServerAnnotationRecord>(
        `/jobs/${encodeURIComponent(jobId)}/annotations/page/${pageNum}`,
        {
          method: "POST",
          body: JSON.stringify(payload),
        },
      ),
  };
}

export interface ServerAnnotationServiceOptions
  extends LoupeServerApiClientOptions {
  jobId: string;
  currentUserEmail: string;
  currentUserName?: string | null;
}

export function createServerAnnotationService(
  options: ServerAnnotationServiceOptions,
): AnnotationService {
  const client = createLoupeServerApiClient(options);
  return {
    list: () => client.listAnnotations(options.jobId),
    getForPage: (pageNum) =>
      client.getAnnotationForPage(options.jobId, pageNum, options.currentUserEmail),
    saveForPage: async (pageNum, fabricJson) => {
      await client.saveAnnotationForPage(options.jobId, pageNum, {
        authorEmail: options.currentUserEmail,
        authorName: options.currentUserName ?? null,
        fabricJson,
      });
    },
    remove: async (id) => {
      await client.deleteAnnotation(options.jobId, id);
    },
  };
}
