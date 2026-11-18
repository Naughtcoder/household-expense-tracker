#!/bin/zsh
# Writes .env.local so local scripts can reach Supabase directly.
# Values are read with echo off, so nothing lands in shell history or on screen.
#
#   zsh scripts/set-env.sh
#
# From Supabase: Project Settings, API Keys, Legacy tab.
set -e
cd "$(dirname "$0")/.."

print "\nFrom Supabase: Project Settings, API Keys, Legacy tab."
print "Nothing typed below is shown.\n"

read -r "URL?Project URL: "
read -rs "ANON?anon public key: "; print ""
read -rs "SVC?service_role key: "; print ""

if [[ -z "$URL" || -z "$ANON" || -z "$SVC" ]]; then
  print "One of them was empty. Nothing written."
  exit 1
fi

cat > .env.local <<ENVEOF
NEXT_PUBLIC_SUPABASE_URL=$URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=$ANON
SUPABASE_SERVICE_ROLE_KEY=$SVC
NEXT_PUBLIC_SITE_URL=https://your-app.vercel.app
ENVEOF

chmod 600 .env.local
unset URL ANON SVC
print "\nWritten .env.local, readable only by you, and gitignored."
