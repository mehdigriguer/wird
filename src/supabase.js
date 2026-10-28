import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Null quand les variables d'environnement ne sont pas configurées :
// l'app reste utilisable en local uniquement.
export const supabase = url && key ? createClient(url, key) : null;
