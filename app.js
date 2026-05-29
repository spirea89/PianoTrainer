const NOTES = [
  { solfege: "do", name: "C4", midi: 60, frequency: 261.63, staffStep: 0 },
  { solfege: "re", name: "D4", midi: 62, frequency: 293.66, staffStep: 1 },
  { solfege: "mi", name: "E4", midi: 64, frequency: 329.63, staffStep: 2 },
  { solfege: "fa", name: "F4", midi: 65, frequency: 349.23, staffStep: 3 },
  { solfege: "sol", name: "G4", midi: 67, frequency: 392.0, staffStep: 4 },
  { solfege: "la", name: "A4", midi: 69, frequency: 440.0, staffStep: 5 },
  { solfege: "si", name: "B4", midi: 71, frequency: 493.88, staffStep: 6 },
  { solfege: "do", name: "C5", midi: 72, frequency: 523.25, staffStep: 7 },
  { solfege: "re", name: "D5", midi: 74, frequency: 587.33, staffStep: 8 },
  { solfege: "mi", name: "E5", midi: 76, frequency: 659.25, staffStep: 9 },
  { solfege: "fa", name: "F5", midi: 77, frequency: 698.46, staffStep: 10 },
  { solfege: "sol", name: "G5", midi: 79, frequency: 783.99, staffStep: 11 },
];

const trainer = document.querySelector("#trainer");
const targetName = document.querySelector("#targetName");
const heardName = document.querySelector("#heardName");
const statusText = document.querySelector("#statusText");
const diagnosticText = document.querySelector("#diagnosticText");
const listenButton = document.querySelector("#listenButton");
const skipButton = document.querySelector("#skipButton");
const nextButton = document.querySelector("#nextButton");
const levelBar = document.querySelector("#levelBar");
const levelValue = document.querySelector("#levelValue");
const noteHead = document.querySelector("#noteHead");
const noteStem = document.querySelector("#noteStem");
const ledgerLines = document.querySelector("#ledgerLines");

const NOTE_X = 450;
const E4_Y = 250;
const STEP = 17.5;
const CENTER_LINE_Y = 180;

let audioContext;
let analyser;
let microphone;
let currentStream;
let timeBuffer;
let animationId;
let currentNote = pickRandomNote();
let listening = false;
let correctFrames = 0;
let wrongFrames = 0;
let advanceTimer;

renderTarget();

listenButton.addEventListener("click", toggleListening);
skipButton.addEventListener("click", nextRandomNote);
nextButton.addEventListener("click", nextRandomNote);

async function toggleListening() {
  if (listening) {
    stopListening();
    return;
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    statusText.textContent = "This browser cannot access the microphone. Open the app in Chrome or Edge on localhost.";
    levelValue.textContent = "unavailable";
    return;
  }

  try {
    listenButton.textContent = "Requesting mic...";
    statusText.textContent = "Waiting for microphone permission.";
    diagnosticText.textContent = `Secure page: ${window.isSecureContext ? "yes" : "no"}. Browser permission prompt should appear now.`;
    levelValue.textContent = "waiting";

    currentStream = await requestMicrophoneStream();

    audioContext = new AudioContext();
    await audioContext.resume();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 4096;
    microphone = audioContext.createMediaStreamSource(currentStream);
    microphone.connect(analyser);
    timeBuffer = new Float32Array(analyser.fftSize);
    listening = true;
    listenButton.textContent = "Stop listening";
    listenButton.classList.add("listening");
    statusText.textContent = "Listening. Play the target note clearly.";
    diagnosticText.textContent = describeStream(currentStream);
    detectPitch();
  } catch (error) {
    listenButton.textContent = "Start listening";
    listenButton.classList.remove("listening");
    levelValue.textContent = "blocked";
    updateLevel(0);
    statusText.textContent = microphoneErrorMessage(error);
    diagnosticText.textContent = `Browser error: ${error?.name || "UnknownError"}${error?.message ? ` - ${error.message}` : ""}`;
  }
}

function stopListening() {
  listening = false;
  cancelAnimationFrame(animationId);
  listenButton.textContent = "Start listening";
  listenButton.classList.remove("listening");
  heardName.textContent = "--";
  levelValue.textContent = "idle";
  diagnosticText.textContent = "Microphone stopped.";
  updateLevel(0);
  setState("idle");

  if (currentStream) {
    currentStream.getTracks().forEach((track) => track.stop());
  }

  audioContext?.close();
  currentStream = undefined;
}

function detectPitch() {
  if (!listening) return;

  analyser.getFloatTimeDomainData(timeBuffer);
  updateLevel(getRms(timeBuffer));
  const frequency = autoCorrelate(timeBuffer, audioContext.sampleRate);

  if (frequency > 0) {
    const heardNote = noteFromFrequency(frequency);
    heardName.textContent = `${heardNote.solfege} ${heardNote.name}`;
    compareNote(heardNote);
  } else {
    heardName.textContent = "--";
    correctFrames = 0;
    wrongFrames = 0;
  }

  animationId = requestAnimationFrame(detectPitch);
}

function compareNote(heardNote) {
  const distance = Math.abs(heardNote.midi - currentNote.midi);
  const isCorrect = distance === 0;

  correctFrames = isCorrect ? correctFrames + 1 : 0;
  wrongFrames = !isCorrect ? wrongFrames + 1 : 0;

  if (correctFrames > 8) {
    setState("correct");
    statusText.textContent = "Correct!";
    if (!advanceTimer) {
      advanceTimer = window.setTimeout(nextRandomNote, 450);
    }
  } else if (wrongFrames > 8) {
    setState("wrong");
    statusText.textContent = "Try again.";
  }
}

function nextRandomNote() {
  const previous = currentNote;
  do {
    currentNote = pickRandomNote();
  } while (currentNote.midi === previous.midi && NOTES.length > 1);

  correctFrames = 0;
  wrongFrames = 0;
  window.clearTimeout(advanceTimer);
  advanceTimer = undefined;
  renderTarget();
  setState("idle");
  statusText.textContent = listening ? "Listening. Play the target note clearly." : "Press Start listening when you are ready.";
}

function pickRandomNote() {
  return NOTES[Math.floor(Math.random() * NOTES.length)];
}

function renderTarget() {
  const y = E4_Y - currentNote.staffStep * STEP;
  targetName.textContent = `${currentNote.solfege} ${currentNote.name}`;
  noteHead.setAttribute("cy", y);
  noteHead.setAttribute("transform", `rotate(-18 ${NOTE_X} ${y})`);
  noteStem.setAttribute("x1", NOTE_X + 28);
  noteStem.setAttribute("x2", NOTE_X + 28);
  noteStem.setAttribute("y1", y - 5);
  noteStem.setAttribute("y2", y - 98);
  renderLedgerLines(y);
}

function renderLedgerLines(y) {
  ledgerLines.innerHTML = "";

  if (y <= 75) {
    addLedgerLine(75);
  }

  if (y >= 285) {
    addLedgerLine(285);
  }
}

function addLedgerLine(y) {
  const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
  line.setAttribute("x1", NOTE_X - 52);
  line.setAttribute("x2", NOTE_X + 52);
  line.setAttribute("y1", y);
  line.setAttribute("y2", y);
  ledgerLines.appendChild(line);
}

function setState(state) {
  trainer.classList.toggle("correct", state === "correct");
  trainer.classList.toggle("wrong", state === "wrong");
}

function noteFromFrequency(frequency) {
  const midi = Math.round(69 + 12 * Math.log2(frequency / 440));
  const note = NOTES.reduce((closest, candidate) => {
    return Math.abs(candidate.midi - midi) < Math.abs(closest.midi - midi) ? candidate : closest;
  }, NOTES[0]);

  return note;
}

function getRms(buffer) {
  return Math.sqrt(buffer.reduce((sum, value) => sum + value * value, 0) / buffer.length);
}

function updateLevel(rms) {
  const percent = Math.min(100, Math.round(rms * 450));
  levelBar.style.width = `${percent}%`;

  if (!listening) return;

  if (percent < 3) {
    levelValue.textContent = "no signal";
  } else if (percent < 20) {
    levelValue.textContent = "low";
  } else if (percent < 65) {
    levelValue.textContent = "capturing";
  } else {
    levelValue.textContent = "loud";
  }
}

function microphoneErrorMessage(error) {
  if (error?.name === "NotAllowedError" && error?.message?.toLowerCase().includes("system")) {
    return "Windows is blocking microphone access. Open Windows Settings > Privacy & security > Microphone, enable microphone access, then allow desktop apps.";
  }

  if (error?.name === "NotAllowedError") {
    return "Microphone is still blocked. Check the browser site setting and Windows microphone privacy settings, then press Start listening again.";
  }

  if (error?.name === "NotFoundError") {
    return "No microphone was found on this device.";
  }

  if (error?.name === "NotReadableError") {
    return "The microphone is busy in another app or cannot be opened.";
  }

  return "Microphone access is needed for pitch detection.";
}

async function requestMicrophoneStream() {
  const cleanPianoConstraints = {
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    },
  };

  try {
    return await navigator.mediaDevices.getUserMedia(cleanPianoConstraints);
  } catch (error) {
    if (error?.name === "OverconstrainedError" || error?.name === "ConstraintNotSatisfiedError") {
      diagnosticText.textContent = "Detailed audio settings failed, retrying with default microphone settings.";
      return navigator.mediaDevices.getUserMedia({ audio: true });
    }

    throw error;
  }
}

function describeStream(stream) {
  const track = stream.getAudioTracks()[0];

  if (!track) {
    return "Microphone stream opened, but no audio track was found.";
  }

  return `Using microphone: ${track.label || "default input"} (${track.readyState}).`;
}

function autoCorrelate(buffer, sampleRate) {
  const rms = getRms(buffer);

  if (rms < 0.01) {
    return -1;
  }

  let start = 0;
  let end = buffer.length - 1;
  const threshold = 0.2;

  for (let i = 0; i < buffer.length / 2; i += 1) {
    if (Math.abs(buffer[i]) < threshold) {
      start = i;
      break;
    }
  }

  for (let i = 1; i < buffer.length / 2; i += 1) {
    if (Math.abs(buffer[buffer.length - i]) < threshold) {
      end = buffer.length - i;
      break;
    }
  }

  const clipped = buffer.slice(start, end);
  const correlations = new Array(clipped.length).fill(0);

  for (let offset = 0; offset < clipped.length; offset += 1) {
    for (let i = 0; i < clipped.length - offset; i += 1) {
      correlations[offset] += clipped[i] * clipped[i + offset];
    }
  }

  let offset = 0;

  while (correlations[offset] > correlations[offset + 1]) {
    offset += 1;
  }

  let maxCorrelation = -1;
  let bestOffset = -1;

  for (let i = offset; i < correlations.length; i += 1) {
    if (correlations[i] > maxCorrelation) {
      maxCorrelation = correlations[i];
      bestOffset = i;
    }
  }

  if (bestOffset <= 0) {
    return -1;
  }

  return sampleRate / bestOffset;
}
