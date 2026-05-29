const NOTES = [
  { solfege: "do", name: "C4", midi: 60, frequency: 261.63, staffStep: -2 },
  { solfege: "re", name: "D4", midi: 62, frequency: 293.66, staffStep: -1 },
  { solfege: "mi", name: "E4", midi: 64, frequency: 329.63, staffStep: 0 },
  { solfege: "fa", name: "F4", midi: 65, frequency: 349.23, staffStep: 1 },
  { solfege: "sol", name: "G4", midi: 67, frequency: 392.0, staffStep: 2 },
  { solfege: "la", name: "A4", midi: 69, frequency: 440.0, staffStep: 3 },
  { solfege: "si", name: "B4", midi: 71, frequency: 493.88, staffStep: 4 },
  { solfege: "do", name: "C5", midi: 72, frequency: 523.25, staffStep: 5 },
  { solfege: "re", name: "D5", midi: 74, frequency: 587.33, staffStep: 6 },
  { solfege: "mi", name: "E5", midi: 76, frequency: 659.25, staffStep: 7 },
  { solfege: "fa", name: "F5", midi: 77, frequency: 698.46, staffStep: 8 },
  { solfege: "sol", name: "G5", midi: 79, frequency: 783.99, staffStep: 9 },
];

const SUPABASE_URL = "https://ctyxpvybgblwkeelzjxs.supabase.co";
const SUPABASE_KEY = "sb_publishable_wk0lGJ38_amb7oqNNzCnYg_SUoNJXLJ";
const POINTS_PER_NOTE = 10;
const supabaseClient = window.supabase?.createClient(SUPABASE_URL, SUPABASE_KEY);

const trainer = document.querySelector("#trainer");
const targetName = document.querySelector("#targetName");
const heardName = document.querySelector("#heardName");
const statusText = document.querySelector("#statusText");
const diagnosticText = document.querySelector("#diagnosticText");
const authForm = document.querySelector("#authForm");
const authTitle = document.querySelector("#authTitle");
const authStatus = document.querySelector("#authStatus");
const usernameInput = document.querySelector("#usernameInput");
const passwordInput = document.querySelector("#passwordInput");
const signupButton = document.querySelector("#signupButton");
const logoutButton = document.querySelector("#logoutButton");
const userBadge = document.querySelector("#userBadge");
const pointsValue = document.querySelector("#pointsValue");
const todayValue = document.querySelector("#todayValue");
const calendarGrid = document.querySelector("#calendarGrid");
const noteSelect = document.querySelector("#noteSelect");
const listenButton = document.querySelector("#listenButton");
const skipButton = document.querySelector("#skipButton");
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
let currentUser;
let currentProfile;

renderTarget();
renderNoteSelect();
renderCalendar([]);
initializeAuth();

listenButton.addEventListener("click", toggleListening);
skipButton.addEventListener("click", nextRandomNote);
authForm.addEventListener("submit", login);
signupButton.addEventListener("click", signup);
logoutButton.addEventListener("click", logout);
noteSelect.addEventListener("change", () => selectNote(Number(noteSelect.value)));

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
      recordCorrectNote();
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

function selectNote(index) {
  currentNote = NOTES[index];
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
  updateNoteSelect();
}

function renderNoteSelect() {
  noteSelect.innerHTML = "";

  NOTES.forEach((note, index) => {
    const option = document.createElement("option");
    option.value = index.toString();
    option.textContent = `${note.solfege} ${note.name}`;
    noteSelect.appendChild(option);
  });

  updateNoteSelect();
}

function updateNoteSelect() {
  const index = NOTES.findIndex((note) => note.midi === currentNote.midi);
  noteSelect.value = index.toString();
}

function renderLedgerLines(y) {
  ledgerLines.innerHTML = "";

  for (let ledgerY = 75; ledgerY >= y; ledgerY -= 35) {
    addLedgerLine(ledgerY);
  }

  for (let ledgerY = 285; ledgerY <= y; ledgerY += 35) {
    addLedgerLine(ledgerY);
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

async function initializeAuth() {
  if (!supabaseClient) {
    authStatus.textContent = "Supabase did not load. Check your internet connection and refresh.";
    return;
  }

  const { data } = await supabaseClient.auth.getSession();
  await setSession(data.session);

  supabaseClient.auth.onAuthStateChange(async (_event, session) => {
    await setSession(session);
  });
}

async function setSession(session) {
  currentUser = session?.user || null;
  currentProfile = null;

  if (!currentUser) {
    userBadge.textContent = "Guest";
    authTitle.textContent = "Save practice progress";
    authStatus.textContent = "Practice works as guest, but points and calendar need a profile.";
    document.querySelector("#authPanel").classList.remove("signed-in");
    authForm.classList.remove("signed-in");
    usernameInput.disabled = false;
    passwordInput.disabled = false;
    signupButton.classList.remove("hidden");
    logoutButton.classList.add("hidden");
    pointsValue.textContent = "0";
    todayValue.textContent = "0";
    renderCalendar([]);
    return;
  }

  currentProfile = await loadProfile();
  const username = currentProfile?.username || usernameFromEmail(currentUser.email);
  userBadge.textContent = username;
  authTitle.textContent = `Hi, ${username}`;
  authStatus.textContent = "Progress is being saved.";
  document.querySelector("#authPanel").classList.add("signed-in");
  authForm.classList.add("signed-in");
  usernameInput.value = username;
  passwordInput.value = "";
  usernameInput.disabled = true;
  passwordInput.disabled = true;
  signupButton.classList.add("hidden");
  logoutButton.classList.remove("hidden");
  await loadProgress();
}

async function signup() {
  const username = cleanUsername(usernameInput.value);
  const password = passwordInput.value;

  if (!username || password.length < 6) {
    authStatus.textContent = "Use a username with 3+ letters and a password with 6+ characters.";
    return;
  }

  setAuthBusy(true, "Creating profile...");
  const email = emailForUsername(username);
  const { data, error } = await supabaseClient.auth.signUp({
    email,
    password,
    options: {
      data: { username },
    },
  });

  if (error) {
    setAuthBusy(false, readableAuthError(error));
    return;
  }

  if (data.user) {
    await saveProfile(data.user.id, username);
  }

  setAuthBusy(false, "Profile created. If Supabase asks for email confirmation, disable it for username-only login.");
  await setSession(data.session);
}

async function login(event) {
  event.preventDefault();
  const username = cleanUsername(usernameInput.value);
  const password = passwordInput.value;

  if (!username || !password) {
    authStatus.textContent = "Enter username and password.";
    return;
  }

  setAuthBusy(true, "Logging in...");
  const { error } = await supabaseClient.auth.signInWithPassword({
    email: emailForUsername(username),
    password,
  });

  if (error) {
    setAuthBusy(false, readableAuthError(error));
    return;
  }

  setAuthBusy(false, "Logged in.");
}

async function logout() {
  await supabaseClient.auth.signOut();
}

async function loadProfile() {
  const { data, error } = await supabaseClient
    .from("profiles")
    .select("username")
    .eq("id", currentUser.id)
    .maybeSingle();

  if (error) {
    authStatus.textContent = `Could not load profile: ${error.message}`;
    return null;
  }

  return data;
}

async function saveProfile(userId, username) {
  const { error } = await supabaseClient.from("profiles").upsert({
    id: userId,
    username,
  });

  if (error) {
    authStatus.textContent = `Profile save failed: ${error.message}`;
  }
}

async function recordCorrectNote() {
  if (!currentUser || !supabaseClient) {
    return;
  }

  const { error } = await supabaseClient.rpc("add_daily_points", {
    point_delta: POINTS_PER_NOTE,
    correct_delta: 1,
  });

  if (error) {
    authStatus.textContent = `Could not save points: ${error.message}`;
    return;
  }

  await loadProgress();
}

async function loadProgress() {
  if (!currentUser || !supabaseClient) return;

  const since = new Date();
  since.setDate(since.getDate() - 28);
  since.setHours(0, 0, 0, 0);

  const { data, error } = await supabaseClient
    .from("daily_progress")
    .select("points, correct_notes, practice_date")
    .eq("user_id", currentUser.id)
    .gte("practice_date", dateKey(since))
    .order("practice_date", { ascending: true });

  if (error) {
    authStatus.textContent = `Could not load progress: ${error.message}`;
    return;
  }

  const days = data || [];
  const today = days.find((day) => day.practice_date === dateKey(new Date()));
  pointsValue.textContent = days.reduce((sum, day) => sum + day.points, 0).toString();
  todayValue.textContent = (today?.points || 0).toString();
  renderCalendar(days);
}

function renderCalendar(days) {
  const progressByDate = new Map(days.map((day) => [day.practice_date, day]));
  calendarGrid.innerHTML = "";

  for (let offset = 27; offset >= 0; offset -= 1) {
    const day = new Date();
    day.setDate(day.getDate() - offset);
    const key = dateKey(day);
    const progress = progressByDate.get(key);
    const cell = document.createElement("span");
    cell.className = `day${progress ? " practiced" : ""}`;
    const readableDate = day.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
    cell.title = progress ? `${readableDate}: ${progress.points} points` : readableDate;
    calendarGrid.appendChild(cell);
  }
}

function setAuthBusy(isBusy, message) {
  authStatus.textContent = message;
  usernameInput.disabled = isBusy || Boolean(currentUser);
  passwordInput.disabled = isBusy || Boolean(currentUser);
  signupButton.disabled = isBusy;
  authForm.querySelector("#loginButton").disabled = isBusy;
}

function cleanUsername(username) {
  return username.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
}

function emailForUsername(username) {
  return `${username}@pianotrainer.example.com`;
}

function usernameFromEmail(email = "") {
  return email.split("@")[0] || "Player";
}

function readableAuthError(error) {
  if (error.message?.toLowerCase().includes("email not confirmed")) {
    return "Login is waiting for email confirmation. In Supabase Auth settings, turn off Confirm email for username-only profiles.";
  }

  return error.message;
}

function isToday(value) {
  return dateKey(value) === dateKey(new Date());
}

function dateKey(value) {
  const date = new Date(value);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
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
