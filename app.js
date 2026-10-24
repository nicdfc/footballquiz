"use strict";

const ROUND_LENGTH = 10;
const EMOJIS = ["⚽", "🦁", "🐯", "🦊", "🐼", "🦄", "🐸", "🚀", "⭐", "🔥", "👑", "🐲"];
const MODE_NAMES = { easy: "Easy", medium: "Medium", hard: "Hard", streak: "Streak" };
const STORE_KEY = "badgeQuiz.v1";

const $ = (id) => document.getElementById(id);
const isNation = (t) => t.id.startsWith("nt-");
const logoUrl = (t) => `logos/${t.id}.png`;

// ---------- Saved players and scores (this device only) ----------

function loadStore() {
  try {
    const data = JSON.parse(localStorage.getItem(STORE_KEY));
    if (data && Array.isArray(data.players)) return data;
  } catch (e) { /* storage blocked or corrupt: start fresh */ }
  return { players: [], current: null, typing: false };
}

const store = loadStore();

function saveStore() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (e) { /* ignore */ }
}

const currentPlayer = () => store.players.find((p) => p.id === store.current) || null;
const bestKey = (mode, typing) => (typing ? `${mode}-typed` : mode);

// ---------- Helpers ----------

function shuffle(list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const pick = (list, n, exclude = new Set()) =>
  shuffle(list.filter((t) => !exclude.has(t.id))).slice(0, n);

function normalise(s) {
  return s
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/ø/g, "o").replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((w) => w && !["fc", "afc", "cf", "sc", "the", "club"].includes(w))
    .join(" ");
}

function editDistance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return d[a.length][b.length];
}

// Lenient check for typed answers: ignores accents, "FC", spaces and small typos.
function typedAnswerMatches(input, team) {
  const guess = normalise(input);
  if (!guess) return false;
  return [team.name, ...team.also].some((name) => {
    const target = normalise(name);
    if (!target) return false;
    if (guess === target || guess.replace(/ /g, "") === target.replace(/ /g, "")) return true;
    const allowed = target.length >= 9 ? 2 : target.length >= 5 ? 1 : 0;
    return editDistance(guess, target) <= allowed;
  });
}

// ---------- Covering team names on badges ----------

// Names are hidden from medium difficulty up, and always when typing (or it would be too easy).
const coverNames = (difficulty) => difficulty >= 2 || game.typing;

function inMask(m, x, y) {
  if (m.length === 4) return x >= m[0] && x <= m[0] + m[2] && y >= m[1] && y <= m[1] + m[3];
  const d = ((x - m[0]) / m[2]) ** 2 + ((y - m[1]) / m[3]) ** 2;
  return d <= 1 && d >= m[4] ** 2;
}

function drawCovers(team, show) {
  const layer = $("covers");
  layer.innerHTML = "";
  layer.classList.remove("gone");
  if (!show) return;
  for (const m of MASKS[team.id] || []) {
    const c = document.createElement("div");
    c.className = "cover";
    if (m.length === 4) {
      const [x, y, w, h] = m;
      const pad = 1.5; // a little extra so no letter edges peek out when zoomed in
      Object.assign(c.style, {
        left: `${x - pad}%`, top: `${y - pad}%`, width: `${w + 2 * pad}%`, height: `${h + 2 * pad}%`,
      });
      if (w > 18 && h > 6) c.textContent = "?";
    } else {
      const [cx, cy, rx, ry, inner] = m;
      c.classList.add("ring");
      Object.assign(c.style, { left: `${cx - rx}%`, top: `${cy - ry}%`, width: `${rx * 2}%`, height: `${ry * 2}%` });
      const hole = `radial-gradient(closest-side, transparent ${inner * 100}%, #000 ${inner * 100 + 0.5}%)`;
      c.style.maskImage = hole;
      c.style.webkitMaskImage = hole;
    }
    layer.appendChild(c);
  }
  fitCovers();
}

// Line the cover layer up exactly with the badge image.
function fitCovers() {
  const img = $("badge");
  Object.assign($("covers").style, {
    left: `${img.offsetLeft}px`, top: `${img.offsetTop}px`,
    width: `${img.offsetWidth}px`, height: `${img.offsetHeight}px`,
  });
}

// Zoom into a random spot on the badge, but not onto a hidden name.
function zoomInto(team) {
  const masks = MASKS[team.id] || [];
  let x, y;
  for (let tries = 0; tries < 20; tries++) {
    x = 25 + Math.random() * 50;
    y = 25 + Math.random() * 50;
    if (!masks.some((m) => inMask(m, x, y))) break;
  }
  // The zoom is applied to the whole stage, so convert the spot to stage percentages.
  const img = $("badge");
  const stage = $("stage");
  const sx = ((img.offsetLeft + (x / 100) * img.offsetWidth) / stage.offsetWidth) * 100;
  const sy = ((img.offsetTop + (y / 100) * img.offsetHeight) / stage.offsetHeight) * 100;
  stage.style.transformOrigin = `${sx}% ${sy}%`;
}

// ---------- Building a round ----------

const byLevel = (level) => TEAMS.filter((t) => t.level === level);

function buildRound(mode) {
  if (mode === "easy") return pick(byLevel(1), ROUND_LENGTH);
  if (mode === "medium") {
    const famous = pick(byLevel(1), 4);
    return shuffle([...famous, ...pick(byLevel(2), ROUND_LENGTH - famous.length)]);
  }
  if (mode === "hard") {
    const medium = pick(byLevel(2), 3);
    return shuffle([...medium, ...pick(byLevel(3), ROUND_LENGTH - medium.length)]);
  }
  return []; // streak picks one at a time
}

// Streak gets harder the longer it goes.
function nextStreakTeam(seen) {
  const n = seen.size;
  const levels = n < 5 ? [1] : n < 12 ? [1, 2] : n < 20 ? [2, 3] : [3];
  let pool = TEAMS.filter((t) => levels.includes(t.level) && !seen.has(t.id));
  if (!pool.length) pool = TEAMS.filter((t) => !seen.has(t.id));
  if (!pool.length) { seen.clear(); pool = TEAMS; }
  return pick(pool, 1)[0];
}

// Wrong answers: same kind (club or country). Harder levels use teams from the same league.
function buildChoices(team, difficulty) {
  const sameKind = TEAMS.filter((t) => t.id !== team.id && isNation(t) === isNation(team));
  const exclude = new Set([team.id]);
  let wrong;
  if (difficulty === 1) {
    wrong = pick(sameKind.filter((t) => t.level === 1), 3, exclude);
  } else if (difficulty === 2) {
    const sameGroup = pick(sameKind.filter((t) => t.group === team.group && t.level <= 2), 1, exclude);
    sameGroup.forEach((t) => exclude.add(t.id));
    wrong = [...sameGroup, ...pick(sameKind.filter((t) => t.level <= 2), 3 - sameGroup.length, exclude)];
  } else {
    const sameGroup = pick(sameKind.filter((t) => t.group === team.group), 3, exclude);
    sameGroup.forEach((t) => exclude.add(t.id));
    wrong = [...sameGroup, ...pick(sameKind, 3 - sameGroup.length, exclude)];
  }
  if (wrong.length < 3) {
    wrong.forEach((t) => exclude.add(t.id));
    wrong = wrong.concat(pick(sameKind, 3 - wrong.length, exclude));
  }
  return shuffle([team, ...wrong]);
}

// ---------- Game state ----------

let game = null;

function startGame(mode) {
  game = {
    mode,
    typing: store.typing,
    round: buildRound(mode),
    index: -1,
    score: 0,
    answers: [],
    seen: new Set(),
  };
  show("play");
  nextQuestion();
}

function difficultyFor(team) {
  if (game.mode === "easy") return 1;
  if (game.mode === "medium") return 2;
  if (game.mode === "hard") return 3;
  return team.level; // streak
}

function nextQuestion() {
  game.index++;
  if (game.mode !== "streak" && game.index >= game.round.length) return finishGame();

  const team = game.mode === "streak" ? nextStreakTeam(game.seen) : game.round[game.index];
  game.seen.add(team.id);
  game.team = team;
  game.answered = false;
  const difficulty = difficultyFor(team);

  // Preload the next badge so it appears instantly.
  const upcoming = game.round[game.index + 1];
  if (upcoming) new Image().src = logoUrl(upcoming);

  // Hide the badge until it has loaded, then cover its name and zoom in.
  const box = $("badge-box");
  const stage = $("stage");
  const img = $("badge");
  const zoom = difficulty === 3;
  box.classList.remove("zoomed", "pop");
  stage.style.visibility = "hidden";
  img.onload = () => {
    stage.style.transition = "none";
    drawCovers(team, coverNames(difficulty));
    if (zoom) {
      zoomInto(team);
      box.classList.add("zoomed");
    }
    void stage.offsetWidth; // apply the zoom before turning the animation back on
    stage.style.transition = "";
    stage.style.visibility = "";
  };
  img.onerror = () => (stage.style.visibility = "");
  const url = logoUrl(team);
  if (img.getAttribute("src") === url && img.complete) img.onload();
  else img.src = url;
  $("zoom-tag").hidden = !zoom;

  $("reveal").hidden = true;
  updateTopbar();

  if (game.typing) {
    $("choices").hidden = true;
    $("typed").hidden = false;
    const input = $("typed-answer");
    input.value = "";
    input.disabled = false;
    $("typed").querySelectorAll("button").forEach((b) => (b.disabled = false));
    input.focus();
  } else {
    $("typed").hidden = true;
    const choices = $("choices");
    choices.hidden = false;
    choices.innerHTML = "";
    for (const option of buildChoices(team, difficulty)) {
      const b = document.createElement("button");
      b.className = "choice";
      b.textContent = option.name;
      b.dataset.id = option.id;
      b.addEventListener("click", () => answer(option.id === team.id, b));
      choices.appendChild(b);
    }
  }
  window.scrollTo({ top: 0 });
}

function updateTopbar() {
  if (game.mode === "streak") {
    $("progress").innerHTML = `🔥 Streak`;
    $("score").textContent = `${game.score}`;
  } else {
    const done = game.index + (game.answered ? 1 : 0);
    $("progress").innerHTML =
      `${MODE_NAMES[game.mode]} · ${Math.min(game.index + 1, ROUND_LENGTH)} of ${ROUND_LENGTH}` +
      `<div class="bar"><span style="width:${(done / ROUND_LENGTH) * 100}%"></span></div>`;
    $("score").textContent = `⭐ ${game.score}`;
  }
}

function answer(correct, button) {
  if (game.answered) return;
  game.answered = true;
  const team = game.team;
  if (correct) game.score++;
  game.answers.push({ team, correct });

  if (button || !game.typing) {
    for (const b of $("choices").children) {
      b.disabled = true;
      if (b.dataset.id === team.id) b.classList.add("right");
    }
    if (button && !correct) button.classList.add("wrong");
  } else {
    $("typed-answer").disabled = true;
    $("typed").querySelectorAll("button").forEach((b) => (b.disabled = true));
  }

  const box = $("badge-box");
  box.classList.remove("zoomed");
  $("covers").classList.add("gone");
  if (correct) {
    box.classList.add("pop");
    burst();
  }
  $("zoom-tag").hidden = true;

  const verdict = $("verdict");
  verdict.className = "verdict " + (correct ? "good" : "bad");
  verdict.textContent = correct ? pickPraise() : "❌ Not quite!";
  $("team-name").textContent = correct ? team.name : `It was ${team.name}`;
  $("fact").textContent = team.fact;

  const streakOver = game.mode === "streak" && !correct;
  const lastQuestion = game.mode !== "streak" && game.index === game.round.length - 1;
  $("next").textContent = streakOver || lastQuestion ? "See my score ➜" : "Next ➜";
  $("reveal").hidden = false;
  updateTopbar();
  $("next").focus({ preventScroll: true });
  $("reveal").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function pickPraise() {
  const praise = ["✅ Correct!", "✅ Brilliant!", "✅ Spot on!", "✅ Golazo!", "✅ Top bins!", "✅ What a strike!"];
  return praise[Math.floor(Math.random() * praise.length)];
}

function onNext() {
  if (game.mode === "streak" && !game.answers[game.answers.length - 1].correct) return finishGame();
  nextQuestion();
}

function finishGame() {
  const { mode, score, typing } = game;
  const player = currentPlayer();
  let newBest = false;
  if (player) {
    const key = bestKey(mode, typing);
    if (score > (player.best[key] || 0)) {
      player.best[key] = score;
      newBest = true;
      saveStore();
    }
  }

  const to = player ? `, ${player.name}` : ""; // "Great run, Sam!" or just "Great run!"
  if (mode === "streak") {
    $("stars").textContent = score >= 20 ? "🔥🔥🔥" : score >= 10 ? "🔥🔥" : "🔥";
    $("final-score").textContent = `${score} in a row`;
    $("final-msg").textContent =
      score >= 20 ? `Badge legend${to}!` :
      score >= 10 ? `Great run${to}!` :
      score >= 5 ? `Nice one${to}! Can you beat it?` : `Have another go${to}!`;
  } else {
    const stars = score === ROUND_LENGTH ? 3 : score >= 7 ? 2 : score >= 4 ? 1 : 0;
    $("stars").textContent = "⭐".repeat(stars) + "☆".repeat(3 - stars);
    $("final-score").textContent = `${score} out of ${ROUND_LENGTH}`;
    $("final-msg").textContent =
      score === ROUND_LENGTH ? `Perfect score${to}! 🏆` :
      score >= 7 ? `Brilliant${to}!` :
      score >= 4 ? `Good effort${to}!` : `Keep practising${to} – you’ll get there!`;
  }
  $("new-best").hidden = !(newBest && score > 0);

  const review = $("review");
  review.innerHTML = "";
  for (const { team, correct } of game.answers) {
    const li = document.createElement("li");
    const img = document.createElement("img");
    img.src = logoUrl(team);
    img.alt = "";
    const label = document.createElement("span");
    label.textContent = team.name;
    const mark = document.createElement("span");
    mark.className = "mark";
    mark.textContent = correct ? "✅" : "❌";
    li.append(img, label, mark);
    review.appendChild(li);
  }

  show("results");
  if (newBest && score > 0) burst(18);
}

// ---------- Little celebration ----------

function burst(count = 8) {
  // Burst from the badge, or from the middle of the screen on the results page.
  const box = $("badge-box").getBoundingClientRect();
  const x = box.width ? box.left + box.width / 2 : window.innerWidth / 2;
  const y = box.height ? Math.max(box.top + box.height / 2, 80) : window.innerHeight / 3;
  const items = ["⚽", "⭐", "🎉", "✨"];
  for (let i = 0; i < count; i++) {
    const s = document.createElement("span");
    s.className = "burst";
    s.textContent = items[i % items.length];
    s.style.left = `${x}px`;
    s.style.top = `${y}px`;
    s.style.setProperty("--dx", `${(Math.random() - 0.5) * 300}px`);
    s.style.setProperty("--dy", `${-80 - Math.random() * 180}px`);
    s.style.setProperty("--rot", `${(Math.random() - 0.5) * 360}deg`);
    document.body.appendChild(s);
    setTimeout(() => s.remove(), 1100);
  }
}

// ---------- Home screen ----------

function show(screen) {
  for (const s of document.querySelectorAll(".screen")) s.hidden = s.id !== screen;
  window.scrollTo({ top: 0 });
}

function renderPlayers() {
  const box = $("players");
  box.innerHTML = "";
  for (const p of store.players) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "player" + (p.id === store.current ? " active" : "");
    b.textContent = `${p.emoji} ${p.name}`;
    b.addEventListener("click", () => {
      store.current = p.id;
      saveStore();
      renderHome();
    });
    if (p.id === store.current) {
      const x = document.createElement("span");
      x.className = "remove";
      x.textContent = "✕";
      x.title = `Remove ${p.name}`;
      x.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!confirm(`Remove ${p.name} and their best scores?`)) return;
        store.players = store.players.filter((q) => q.id !== p.id);
        store.current = store.players[0] ? store.players[0].id : null;
        saveStore();
        renderHome();
      });
      b.appendChild(x);
    }
    box.appendChild(b);
  }
  const add = document.createElement("button");
  add.type = "button";
  add.className = "player add";
  add.textContent = store.players.length ? "+ Add player" : "+ Add your name";
  add.addEventListener("click", openNewPlayer);
  box.appendChild(add);
}

let chosenEmoji = EMOJIS[0];

function openNewPlayer() {
  const form = $("new-player");
  form.hidden = false;
  chosenEmoji = EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
  const pickBox = $("emoji-pick");
  pickBox.innerHTML = "";
  for (const e of EMOJIS) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = e;
    b.className = e === chosenEmoji ? "active" : "";
    b.addEventListener("click", () => {
      chosenEmoji = e;
      for (const other of pickBox.children) other.className = other === b ? "active" : "";
    });
    pickBox.appendChild(b);
  }
  $("new-name").value = "";
  $("new-name").focus();
}

function renderBests() {
  const player = currentPlayer();
  for (const el of document.querySelectorAll("[data-best]")) {
    const mode = el.dataset.best;
    const best = player ? player.best[bestKey(mode, store.typing)] : undefined;
    el.textContent = !player || best === undefined ? "" :
      mode === "streak" ? `Best: ${best} 🔥` : `Best: ${best}/${ROUND_LENGTH}`;
  }
}

function renderToggle() {
  for (const b of document.querySelectorAll("[data-typing]")) {
    b.setAttribute("aria-checked", String(b.dataset.typing === String(store.typing)));
  }
}

function renderHome() {
  renderPlayers();
  renderBests();
  renderToggle();
}

// ---------- Wire up ----------

$("new-player").addEventListener("submit", (e) => {
  e.preventDefault();
  const name = $("new-name").value.trim();
  if (!name) return;
  const player = { id: String(Date.now()), name, emoji: chosenEmoji, best: {} };
  store.players.push(player);
  store.current = player.id;
  saveStore();
  $("new-player").hidden = true;
  renderHome();
});
$("cancel-player").addEventListener("click", () => ($("new-player").hidden = true));

for (const b of document.querySelectorAll("[data-mode]")) {
  b.addEventListener("click", () => startGame(b.dataset.mode));
}
for (const b of document.querySelectorAll("[data-typing]")) {
  b.addEventListener("click", () => {
    store.typing = b.dataset.typing === "true";
    saveStore();
    renderToggle();
    renderBests();
  });
}

$("typed").addEventListener("submit", (e) => {
  e.preventDefault();
  const value = $("typed-answer").value;
  if (!value.trim()) return;
  answer(typedAnswerMatches(value, game.team));
});
$("give-up").addEventListener("click", () => answer(false));
$("next").addEventListener("click", onNext);
$("quit").addEventListener("click", () => {
  if (game && game.answers.length && !confirm("Stop this game?")) return;
  renderHome();
  show("home");
});
$("again").addEventListener("click", () => startGame(game.mode));
$("home-btn").addEventListener("click", () => { renderHome(); show("home"); });
window.addEventListener("resize", fitCovers);

renderHome();
