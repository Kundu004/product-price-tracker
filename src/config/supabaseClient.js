const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  // Fail loudly and immediately at startup rather than letting every
  // later database call fail with a confusing error deep in a request.
  throw new Error(
    'Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variables.'
  );
}

const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = supabase;
