import axios from 'axios';
const apiUrl = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:3000/api/v1';
if (!URL.canParse(apiUrl)) throw new Error('VITE_API_URL inválida');
export const http = axios.create({ baseURL: apiUrl, timeout: 10_000, withCredentials: true });
