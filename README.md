# PianoTrainer

A small browser app for practicing note recognition on piano.

Live app: https://spirea89.github.io/PianoTrainer/

## Features

- Shows a random note on a treble staff.
- Uses do re mi fa sol la si notation.
- Listens through the device microphone.
- Turns green when the played piano note is correct.
- Turns red when a different detected note is played.
- Allows skipping to the next random note.

## Run

Serve the folder locally so the browser can request microphone permission:

```powershell
node dev-server.cjs
```

Then open:

```text
http://localhost:5173
```

## Supabase setup

1. Open the Supabase SQL Editor.
2. Run the contents of `supabase-schema.sql`.
3. For username-only accounts, open `Authentication > Sign In / Providers > Email` and turn off email confirmation.

The browser app uses the public Supabase project URL and publishable key. User data is protected by Row Level Security policies in `supabase-schema.sql`.
