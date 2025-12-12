/**
 * Database Configuration
 * 
 * ⚠️ IMPORTANT: This file is DEPRECATED
 * 
 * We are now using Supabase for all database operations.
 * This file is kept for reference but should not be used.
 * 
 * All database operations should use Supabase client from the frontend
 * or Supabase Edge Functions for server-side operations.
 */

// MySQL connection is DEPRECATED - Using Supabase instead
// This file is kept for reference only

export type DB = any; // Deprecated

export async function query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  throw new Error('MySQL is deprecated. Use Supabase instead.');
}

export async function getConnection() {
  throw new Error('MySQL is deprecated. Use Supabase instead.');
}

export default null;
