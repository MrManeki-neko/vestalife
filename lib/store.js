import { createClient } from "@supabase/supabase-js";

export function createStore() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  }

  const client = createClient(url, key, { auth: { persistSession: false } });

  return {
    async get() {
      const { data, error } = await client
        .from("board_state")
        .select("doc")
        .eq("id", 1)
        .maybeSingle();

      if (error) {
        throw new Error(`store.get failed: ${error.message}`);
      }

      return data ? data.doc : null;
    },

    async put(doc) {
      const { error } = await client
        .from("board_state")
        .upsert({ id: 1, doc, updated_at: new Date().toISOString() });

      if (error) {
        throw new Error(`store.put failed: ${error.message}`);
      }
    },
  };
}
