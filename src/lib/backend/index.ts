import { readEnv } from '../../config/project';
import { LocalPublicBackend } from './localBackend';
import { LocalAdminApi } from './localAdmin';
import { SupabaseAdminApi, SupabasePublicBackend } from './supabaseBackend';
import type { AdminApi, PublicBackend } from './types';

const env = readEnv();

/** true se il sito è collegato a Supabase (modalità test o ricerca, decisa dal server). */
export const isConnected = Boolean(env.supabaseUrl && env.supabaseAnonKey);

let pub: PublicBackend | null = null;
let adm: AdminApi | null = null;

export function publicBackend(): PublicBackend {
  if (!pub) pub = isConnected ? new SupabasePublicBackend(env.supabaseUrl!, env.supabaseAnonKey!) : new LocalPublicBackend();
  return pub;
}

export function adminApi(): AdminApi {
  if (!adm) {
    adm = isConnected
      ? new SupabaseAdminApi(env.supabaseUrl!, env.supabaseAnonKey!, `${location.origin}/admin`)
      : new LocalAdminApi();
  }
  return adm;
}
