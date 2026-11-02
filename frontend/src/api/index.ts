import { httpClient } from './httpClient';
import type { ApiClient } from './client';
export const isMock = import.meta.env.VITE_API_MODE !== 'http';
export const api: ApiClient = isMock ? (await import('./mockClient')).mockClient : httpClient;
