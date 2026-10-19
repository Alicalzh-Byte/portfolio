/**
 * 后台统一 API 客户端。
 *
 * 约定（AGENTS.md §4.1 / TECH_DESIGN §3.3）：
 * - 所有请求带 `credentials: 'include'`，让 Cloudflare Access 的会话 cookie 随请求发送；
 * - 解析统一信封：成功 `{ ok: true, data }`，失败 `{ ok: false, error: { code, message, fields } }`；
 * - 失败一律抛出 `ApiRequestError`，由表单 hook 统一转成提示与字段级错误。
 *
 * 这里是后台唯一的取数出口：页面不得直接 fetch，避免出现「同一后端、三套错误处理」。
 */
import { API_ERROR_CODES } from '@portfolio/shared';
import type { ApiErrorCode } from '@portfolio/shared';

type JsonRecord = Record<string, unknown>;

/** 请求失败时抛出的统一错误类型。code 额外覆盖只有客户端才能识别的 NETWORK_ERROR。 */
export class ApiRequestError extends Error {
  readonly code: ApiErrorCode | 'NETWORK_ERROR';
  readonly fields: Record<string, string>;
  readonly status: number | null;

  constructor(params: {
    code: ApiErrorCode | 'NETWORK_ERROR';
    message: string;
    fields?: Record<string, string>;
    status?: number | null;
  }) {
    super(params.message);
    this.name = 'ApiRequestError';
    this.code = params.code;
    this.fields = params.fields ?? {};
    this.status = params.status ?? null;
  }
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isErrorCode(value: unknown): value is ApiErrorCode {
  return typeof value === 'string' && (API_ERROR_CODES as readonly string[]).includes(value);
}

/** 从失败信封中取出错误码、说明与字段级错误；结构异常时给出保守默认值。 */
function readFailure(payload: JsonRecord): {
  code: ApiErrorCode;
  message: string | null;
  fields: Record<string, string>;
} {
  const raw = payload.error;
  if (!isRecord(raw)) return { code: 'INTERNAL_ERROR', message: null, fields: {} };

  const fields: Record<string, string> = {};
  if (isRecord(raw.fields)) {
    for (const [key, value] of Object.entries(raw.fields)) {
      if (typeof value === 'string') fields[key] = value;
    }
  }

  return {
    code: isErrorCode(raw.code) ? raw.code : 'INTERNAL_ERROR',
    message: typeof raw.message === 'string' && raw.message ? raw.message : null,
    fields,
  };
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, { credentials: 'include', ...init });
  } catch {
    throw new ApiRequestError({
      code: 'NETWORK_ERROR',
      message: '无法连接后端，请确认本地 Functions 已启动或网络可用',
    });
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ApiRequestError({
      code: 'INTERNAL_ERROR',
      message: `响应不是合法的 JSON（HTTP ${response.status}）`,
      status: response.status,
    });
  }

  if (!isRecord(payload) || typeof payload.ok !== 'boolean') {
    throw new ApiRequestError({
      code: 'INTERNAL_ERROR',
      message: '响应不符合统一信封格式',
      status: response.status,
    });
  }

  if (payload.ok === true && response.ok) {
    return payload.data as T;
  }

  const failure = readFailure(payload);
  throw new ApiRequestError({
    code: failure.code,
    message: failure.message ?? `请求失败（HTTP ${response.status}）`,
    fields: failure.fields,
    status: response.status,
  });
}

function jsonInit(method: string, body: unknown, signal?: AbortSignal): RequestInit {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  };
}

/** 路径一律取 `ADMIN_API` / `PUBLIC_API` 常量，避免手写字符串拼错。 */
export const apiClient = {
  get<T>(path: string, signal?: AbortSignal): Promise<T> {
    return request<T>(path, { method: 'GET', signal });
  },
  post<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
    return request<T>(path, jsonInit('POST', body, signal));
  },
  put<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
    return request<T>(path, jsonInit('PUT', body, signal));
  },
  patch<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
    return request<T>(path, jsonInit('PATCH', body, signal));
  },
  delete<T>(path: string, signal?: AbortSignal): Promise<T> {
    return request<T>(path, { method: 'DELETE', signal });
  },
  /** 文件上传：FormData 交给浏览器自动带 multipart 边界，不能手动设置 Content-Type。 */
  upload<T>(path: string, file: File, signal?: AbortSignal): Promise<T> {
    const form = new FormData();
    form.append('file', file);
    return request<T>(path, { method: 'POST', body: form, signal });
  },
};
