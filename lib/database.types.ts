// Placeholder until the first tables exist. `bun run db:types` regenerates this file from the
// local database (needs `bun run db:start`). Do not edit by hand once generated.
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  public: {
    Tables: Record<string, never>
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
