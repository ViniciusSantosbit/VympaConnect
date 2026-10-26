import axios from 'axios';
import { toast } from 'sonner';
const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api/v1';
if (!URL.canParse(apiUrl)) throw new Error('VITE_API_URL inválida');
export const http = axios.create({ baseURL: apiUrl, timeout: 10_000, withCredentials: false });
http.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    toast.error('Não foi possível concluir a solicitação. Tente novamente.');
    return Promise.reject(error);
  },
);
