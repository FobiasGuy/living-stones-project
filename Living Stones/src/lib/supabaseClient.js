import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const supabase = createClient(supabaseUrl, supabaseKey);

// Accounts only ask for a username + password, but Supabase Auth needs an
// email under the hood. We derive one deterministically from the username
// so there's no separate email step for the customer to see or fill in.
const EMAIL_DOMAIN = "livingstones.local";
export function usernameToEmail(username) {
  return `${username.trim().toLowerCase()}@${EMAIL_DOMAIN}`;
}
