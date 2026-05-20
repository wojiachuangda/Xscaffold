// [ui] ID: WEBUI-V2.1 | Date: 2026-05-20 | Description: Thin fetch wrapper applying JWT + envelope error parsing
'use strict';

import { state } from './state.js';

export async function api(path, options = {}) {
    const auth = options.auth !== false;
    const response = await fetch(`${state.apiBase}${path}`, buildRequestOptions(options, auth));
    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('application/json') ? await response.json() : await response.text();
    if (!response.ok || (payload && payload.success === false)) {
        throw new Error(readErrorMessage(payload, response.status));
    }
    return payload;
}

export function buildRequestOptions(options, auth) {
    const headers = { ...(options.headers || {}) };
    if (auth && state.token) {
        headers.Authorization = `Bearer ${state.token}`;
    }
    if (options.body !== undefined) {
        headers['content-type'] = 'application/json';
    }
    return {
        method: options.method || 'GET',
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
    };
}

export function readErrorMessage(payload, status) {
    if (payload && payload.error && payload.error.message) {
        return payload.error.message;
    }
    if (typeof payload === 'string' && payload) {
        return payload;
    }
    return `Request failed (${status})`;
}

export function unwrapSettled(result) {
    return result.status === 'fulfilled' ? result.value.data : null;
}

export function unwrapData(result, fallback, onError) {
    if (result.status === 'fulfilled') {
        return result.value.data || fallback;
    }
    if (onError) {
        onError(result.reason);
    }
    return fallback;
}
