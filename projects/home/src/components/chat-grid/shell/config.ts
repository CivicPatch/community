// Public Supabase project config. The publishable key is designed to be shipped
// client-side, so it's fine in the static bundle. Leave either value empty to
// fall back to the local BroadcastChannel fake backend (offline dev / tests).

export const SUPABASE_URL = 'https://vclvvgolzzebiojevjsx.supabase.co'
// gitleaks:allow — publishable key is public by design (ships in the client bundle)
export const SUPABASE_KEY = 'sb_publishable_ovlnpaeGtLfgvh_g5ha4Hw_9jB20Zfz' // gitleaks:allow
