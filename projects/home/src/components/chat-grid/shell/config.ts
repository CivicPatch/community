// Public Supabase project config. The publishable key is designed to be shipped
// client-side, so it's fine in the static bundle. Leave either value empty to
// fall back to the local BroadcastChannel fake backend (offline dev / tests).

// Where the published grid lives — the "Edit on GitHub" link opens this file's
// editor; the user pastes the exported JSON and "Propose changes" opens a PR.
export const GITHUB_EDIT_URL =
  'https://github.com/CivicPatch/community/edit/main/projects/home/public/grid.json'

export const SUPABASE_URL = 'https://vclvvgolzzebiojevjsx.supabase.co'
// gitleaks:allow — publishable key is public by design (ships in the client bundle)
export const SUPABASE_KEY = 'sb_publishable_ovlnpaeGtLfgvh_g5ha4Hw_9jB20Zfz' // gitleaks:allow
