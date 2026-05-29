# PianoTrainer

A small browser app for practicing note recognition on piano.

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
