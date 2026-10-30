import axios from 'axios';
import { resolveApiUrl } from './api-url';
const apiUrl = resolveApiUrl(import.meta.env.VITE_API_URL, import.meta.env.PROD);
export const http = axios.create({ baseURL: apiUrl, timeout: 10_000, withCredentials: true });
