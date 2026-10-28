import axios from 'axios';
import { authMessage } from '@/features/auth/auth-api';
export function prospectMessage(error: unknown) {
  if (
    axios.isAxiosError(error) &&
    [400, 409, 429].includes(error.response?.status ?? 0) &&
    typeof error.response?.data?.message === 'string'
  )
    return error.response.data.message as string;
  return authMessage(error);
}
