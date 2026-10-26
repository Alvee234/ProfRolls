// ---------------------------------------------------------------------------
// SBMCH Student Roll Directory - configuration
//
// Fill in the two values below from your Supabase project:
//   Supabase dashboard -> Project Settings -> API
//     Project URL  -> SUPABASE_URL
//     anon public   -> SUPABASE_ANON_KEY
//
// The anon key is designed to be public: it only lets signed-in students read
// the roster, thanks to the Row Level Security policies in schema.sql.
// NEVER put the service_role key in this file.
// ---------------------------------------------------------------------------
window.SB_CONFIG = {
  SUPABASE_URL: "https://ktykdujhekqmkvgkmbxs.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt0eWtkdWpoZWtxbWt2Z2ttYnhzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI5OTM0MDEsImV4cCI6MjEwODU2OTQwMX0.tgmqhrfrgMNNUMr-TLJN7Uk1cwrpXzLwBy4LfK5r0tk",

  // Table created by schema.sql
  TABLE: "students",

  // Fake domain used to build a Supabase auth account from a prof roll number.
  // No mail is ever sent there (confirm email is switched off in Supabase).
  EMAIL_DOMAIN: "sbmch.students",

  // Supabase Auth requires a password for every account. Because this site
  // logs students in with their prof roll number only, this value is shared by
  // every account and is visible in the page source on purpose - it is not a
  // secret. Raise it to at least 12 characters if you want to change it.
  SHARED_PASSPHRASE: "sbmch-students-directory-2026"
};
