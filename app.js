const fallbackLyrics = [
  { time: 0, text: "还没有字幕文件" },
  { time: 8, text: "请添加同名 lrc 或 txt 字幕" },
  { time: 16, text: "格式示例：[00:16.00]这一句会在第 16 秒出现" }
];

const tracks = window.MUSIC_TRACKS || [];

const audio = document.querySelector("#audio");
const trackList = document.querySelector("#trackList");
const title = document.querySelector("#trackTitle");
const meta = document.querySelector("#trackMeta");
const lyrics = document.querySelector("#lyrics");
const playBtn = document.querySelector("#playBtn");
const prevBtn = document.querySelector("#prevBtn");
const nextBtn = document.querySelector("#nextBtn");
const seek = document.querySelector("#seek");
const currentTime = document.querySelector("#currentTime");
const duration = document.querySelector("#duration");
const stage = document.querySelector(".stage");
const captionStatus = document.querySelector("#captionStatus");
const delayCaptionsBtn = document.querySelector("#delayCaptionsBtn");
const advanceCaptionsBtn = document.querySelector("#advanceCaptionsBtn");
const exportCaptionsBtn = document.querySelector("#exportCaptionsBtn");
const lyricsWrap = document.querySelector(".lyrics-wrap");

let currentIndex = 0;
let activeLyricIndex = -1;
let isSeeking = false;
let userIsReadingLyrics = false;
let lyricScrollTimer = null;

function formatTime(value) {
  if (!Number.isFinite(value)) return "0:00";
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function normalizeLyrics(value) {
  if (!Array.isArray(value)) return fallbackLyrics;

  const normalized = value
    .map((line) => ({
      time: Number(line.time),
      text: String(line.text || "").trim()
    }))
    .filter((line) => Number.isFinite(line.time) && line.text)
    .sort((a, b) => a.time - b.time);

  return normalized.length ? normalized : fallbackLyrics;
}

function buildPlainTextLyrics(lines, totalDuration) {
  if (!lines.length) return fallbackLyrics;

  const usableDuration = Number.isFinite(totalDuration) && totalDuration > 0
    ? totalDuration
    : lines.length * 6;
  const step = usableDuration / Math.max(lines.length, 1);

  return normalizeLyrics(lines.map((line, index) => ({
    time: Math.max(0, index * step),
    text: line
  })));
}

function parseTimeCode(value) {
  const match = value.match(/^(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?$/);
  if (!match) return null;

  const minutes = Number(match[1]);
  const seconds = Number(match[2]);
  const milliseconds = Number((match[3] || "0").padEnd(3, "0"));
  return (minutes * 60) + seconds + (milliseconds / 1000);
}

function parseLrcCaptions(text) {
  let offset = 0;
  const lines = [];

  text.split(/\r?\n/).forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line) return;

    const offsetMatch = line.match(/^\[offset:([+-]?\d+)\]$/i);
    if (offsetMatch) {
      offset = Number(offsetMatch[1]) / 1000;
      return;
    }

    const timeMatches = [...line.matchAll(/\[(\d{1,3}:\d{2}(?:[.:]\d{1,3})?)\]/g)];
    if (!timeMatches.length) return;

    const textStart = timeMatches[timeMatches.length - 1].index + timeMatches[timeMatches.length - 1][0].length;
    const lyricText = line.slice(textStart).trim();
    if (!lyricText) return;

    timeMatches.forEach((match) => {
      const time = parseTimeCode(match[1]);
      if (time === null) return;
      lines.push({ time: Math.max(0, time + offset), text: lyricText });
    });
  });

  return normalizeLyrics(lines);
}

function parseTxtCaptions(text) {
  const rawLines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const timedLines = rawLines
    .map((line) => {
      const match = line.match(/^\[(\d{1,2}:\d{2}(?:\.\d{1,3})?)\]\s*(.+)$/);
      if (!match) return null;

      const time = parseTimeCode(match[1]);
      if (time === null) return null;

      return { time, text: match[2].trim() };
    })
    .filter(Boolean);

  if (timedLines.length) return normalizeLyrics(timedLines);

  return buildPlainTextLyrics(rawLines, audio.duration);
}

function setCaptionStatus(text) {
  captionStatus.textContent = text;
}

function waitForMetadata() {
  if (Number.isFinite(audio.duration) && audio.duration > 0) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const done = () => {
      audio.removeEventListener("loadedmetadata", done);
      audio.removeEventListener("durationchange", done);
      audio.removeEventListener("error", done);
      resolve();
    };

    audio.addEventListener("loadedmetadata", done, { once: true });
    audio.addEventListener("durationchange", done, { once: true });
    audio.addEventListener("error", done, { once: true });
  });
}

function renderTrackList() {
  trackList.innerHTML = tracks.map((track, index) => `
    <button class="track" type="button" data-index="${index}">
      <span class="track-number">${String(index + 1).padStart(2, "0")}</span>
      <span>
        <span class="track-name">${track.title}</span>
        <span class="track-artist">${track.artist || "Unknown Artist"}</span>
      </span>
    </button>
  `).join("");
}

function renderLyrics(track) {
  activeLyricIndex = -1;
  lyricsWrap.scrollTop = 0;
  lyrics.innerHTML = normalizeLyrics(track.lyrics).map((line) => `
    <p class="lyric-line">${line.text}</p>
  `).join("");
}

async function loadCaptionFile(track) {
  if (!track.captions) return null;

  const response = await fetch(`${track.captions}?v=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) return null;

  const captionPath = track.captions.toLowerCase();
  if (captionPath.endsWith(".lrc")) {
    return parseLrcCaptions(await response.text());
  }

  if (captionPath.endsWith(".txt")) {
    return parseTxtCaptions(await response.text());
  }

  const data = await response.json();
  if (data.generated === false) return null;

  return normalizeLyrics(data.lyrics);
}

async function ensureCaptions(track) {
  try {
    setCaptionStatus("正在读取字幕文件...");
    const fromFile = await loadCaptionFile(track);
    if (fromFile) {
      track.lyrics = fromFile;
      renderLyrics(track);
      setCaptionStatus("已加载字幕文件");
      return;
    }
  } catch {
    setCaptionStatus("字幕文件不可用");
  }

  track.lyrics = fallbackLyrics;
  renderLyrics(track);
  setCaptionStatus("没有找到字幕文件");
}

async function setActiveTrack(index) {
  currentIndex = (index + tracks.length) % tracks.length;
  const track = tracks[currentIndex];

  audio.src = track.src;
  audio.load();
  title.textContent = track.title;
  meta.textContent = track.artist || "Unknown Artist";
  track.lyrics = track.lyrics || fallbackLyrics;
  renderLyrics(track);
  setCaptionStatus("字幕待加载");

  document.querySelectorAll(".track").forEach((button, buttonIndex) => {
    button.classList.toggle("active", buttonIndex === currentIndex);
  });

  await waitForMetadata();
  await ensureCaptions(track);
}

async function playTrack(index = currentIndex) {
  await setActiveTrack(index);
  await audio.play();
}

function updatePlayState() {
  const playing = !audio.paused;
  playBtn.textContent = playing ? "Ⅱ" : "▶";
  playBtn.setAttribute("aria-label", playing ? "暂停" : "播放");
  stage.classList.toggle("is-playing", playing);
}

function updateTimeline() {
  if (!isSeeking && Number.isFinite(audio.duration)) {
    seek.max = String(audio.duration);
    seek.value = String(audio.currentTime);
  }

  currentTime.textContent = formatTime(audio.currentTime);
  duration.textContent = formatTime(audio.duration);
}

function updateLyrics() {
  const track = tracks[currentIndex];
  const trackLyrics = normalizeLyrics(track.lyrics);
  const captionOffset = Number(track.captionOffset || 0);
  const captionTime = Math.max(0, audio.currentTime + captionOffset);
  const index = trackLyrics.findIndex((line, lineIndex) => {
    const nextLine = trackLyrics[lineIndex + 1];
    return captionTime >= line.time && (!nextLine || captionTime < nextLine.time);
  });

  if (index === -1 || index === activeLyricIndex) return;

  activeLyricIndex = index;
  const lines = [...document.querySelectorAll(".lyric-line")];
  lines.forEach((line, lineIndex) => {
    line.classList.toggle("active", lineIndex === activeLyricIndex);
  });

  if (userIsReadingLyrics) return;

  const activeLine = lines[activeLyricIndex];
  if (!activeLine || !lyricsWrap) return;

  const target = activeLine.offsetTop - (lyricsWrap.clientHeight / 2) + (activeLine.clientHeight / 2);
  lyricsWrap.scrollTo({
    top: Math.max(0, target),
    behavior: "smooth"
  });
}

function pauseLyricAutoScroll() {
  userIsReadingLyrics = true;
  window.clearTimeout(lyricScrollTimer);
  lyricScrollTimer = window.setTimeout(() => {
    userIsReadingLyrics = false;
    activeLyricIndex = -1;
    updateLyrics();
  }, 5000);
}

function exportCurrentCaptions() {
  const track = tracks[currentIndex];
  const data = JSON.stringify({ lyrics: normalizeLyrics(track.lyrics) }, null, 2);
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const filename = `${track.id}.json`;

  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
  setCaptionStatus(`已导出 ${filename}`);
}

function shiftCaptions(seconds) {
  const track = tracks[currentIndex];
  track.captionOffset = Number((Number(track.captionOffset || 0) + seconds).toFixed(2));
  activeLyricIndex = -1;
  userIsReadingLyrics = false;
  updateLyrics();
  const direction = track.captionOffset >= 0 ? "提前" : "延后";
  setCaptionStatus(`字幕整体${direction} ${Math.abs(track.captionOffset).toFixed(1)} 秒`);
}

trackList.addEventListener("click", (event) => {
  const button = event.target.closest(".track");
  if (!button) return;
  playTrack(Number(button.dataset.index));
});

playBtn.addEventListener("click", async () => {
  if (!audio.src) {
    await playTrack(0);
    return;
  }

  if (audio.paused) {
    await audio.play();
  } else {
    audio.pause();
  }
});

prevBtn.addEventListener("click", () => playTrack(currentIndex - 1));
nextBtn.addEventListener("click", () => playTrack(currentIndex + 1));
delayCaptionsBtn.addEventListener("click", () => shiftCaptions(-0.5));
advanceCaptionsBtn.addEventListener("click", () => shiftCaptions(0.5));
exportCaptionsBtn.addEventListener("click", exportCurrentCaptions);

function seekToSliderValue() {
  if (Number.isFinite(audio.duration)) {
    audio.currentTime = Number(seek.value);
    currentTime.textContent = formatTime(audio.currentTime);
    activeLyricIndex = -1;
    userIsReadingLyrics = false;
    updateLyrics();
  }
}

seek.addEventListener("pointerdown", () => {
  isSeeking = true;
});

seek.addEventListener("input", seekToSliderValue);
seek.addEventListener("change", seekToSliderValue);

seek.addEventListener("pointerup", () => {
  isSeeking = false;
});

seek.addEventListener("keyup", () => {
  isSeeking = false;
});

lyricsWrap.addEventListener("wheel", pauseLyricAutoScroll, { passive: true });
lyricsWrap.addEventListener("touchstart", pauseLyricAutoScroll, { passive: true });
lyricsWrap.addEventListener("pointerdown", pauseLyricAutoScroll);

audio.addEventListener("play", updatePlayState);
audio.addEventListener("pause", updatePlayState);
audio.addEventListener("loadedmetadata", updateTimeline);
audio.addEventListener("timeupdate", () => {
  updateTimeline();
  updateLyrics();
});
audio.addEventListener("ended", () => playTrack(currentIndex + 1));

if (tracks.length) {
  renderTrackList();
  setActiveTrack(0);
} else {
  title.textContent = "还没有歌曲";
  meta.textContent = "请在 music-manifest.js 中添加音乐";
  setCaptionStatus("歌单为空");
}

updatePlayState();
