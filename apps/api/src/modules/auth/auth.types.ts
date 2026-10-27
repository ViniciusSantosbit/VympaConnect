import type { Request } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AdminProfile } from '../../generated/prisma/client.js';
import type { VerifiedIdentity } from './supabase-identity.service.js';
export type AuthContext = {
  sessionId: string;
  identity: VerifiedIdentity;
  client: SupabaseClient;
  profile: AdminProfile | null;
  recovery: boolean;
};
export type AuthRequest = Request & { auth: AuthContext };
