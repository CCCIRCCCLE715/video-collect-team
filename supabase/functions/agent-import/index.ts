import {createHandler} from './handler.js';
// A custom, revocable, write-only member token is verified inside the handler.
// The elevated key stays in the function environment and never reaches a browser.
const keys=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}');
Deno.serve(createHandler({
  url:Deno.env.get('SUPABASE_URL'),
  serviceKey:keys.default||Deno.env.get('SUPABASE_SECRET_KEY')||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
}));
