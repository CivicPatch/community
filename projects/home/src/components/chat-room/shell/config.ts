// Public Supabase project config. The publishable key is designed to be shipped
// client-side, so it's fine in the static bundle. Leave either value empty to
// fall back to the local BroadcastChannel fake backend (offline dev / tests).

// Base of the "Edit on GitHub" link; the CURRENT room's path (e.g. /rooms/garden.json)
// is appended, so the PR edits whichever room you're in — not always home.json.
export const GITHUB_EDIT_BASE = 'https://github.com/CivicPatch/community/edit/main/projects/home/public'

export const SUPABASE_URL = 'https://vclvvgolzzebiojevjsx.supabase.co'
// gitleaks:allow — publishable key is public by design (ships in the client bundle)
export const SUPABASE_KEY = 'sb_publishable_ovlnpaeGtLfgvh_g5ha4Hw_9jB20Zfz' // gitleaks:allow
