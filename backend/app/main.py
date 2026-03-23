from __future__ import annotations

import logging
import os
import re
import time
import uuid
from pathlib import Path
from typing import Dict, List, Sequence

import edge_tts
import eng_to_ipa as ipa
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

load_dotenv()

logger = logging.getLogger("shadow_reading")
if not logger.handlers:
  logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Shadow Reading API", version="0.2.0")

app.add_middleware(
  CORSMiddleware,
  allow_origins=["*"],
  allow_methods=["*"],
  allow_headers=["*"],
)

AUDIO_DIR = Path(__file__).resolve().parent.parent / "generated_audio"
AUDIO_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/media/audio", StaticFiles(directory=AUDIO_DIR), name="media_audio")

STOP_WORDS = {"the", "a", "is", "was", "to", "of", "in", "and"}

VOICE = os.getenv("EDGE_TTS_VOICE", "en-GB-LibbyNeural")
RATE = os.getenv("EDGE_TTS_RATE", "+0%")
VOLUME = os.getenv("EDGE_TTS_VOLUME", "+0%")
AUDIO_RETENTION_SECONDS = int(os.getenv("AUDIO_RETENTION_SECONDS", "3600"))
MAX_AUDIO_FILES = int(os.getenv("MAX_AUDIO_FILES", "500"))
CLEANUP_INTERVAL_SECONDS = 300

IPA_CACHE: Dict[str, str] = {}
LAST_CLEANUP_TS = 0.0
NOUN_SUFFIXES: Sequence[str] = (
  "tion",
  "sion",
  "ment",
  "ness",
  "ity",
  "ship",
  "ence",
  "ance",
  "ture",
  "ology",
  "ism",
  "ist",
  "age",
  "ery",
  "ory",
  "dom",
  "hood",
  "ment",
  "ing",
)
COMMON_NOUNS = {
  "family",
  "people",
  "school",
  "friend",
  "teacher",
  "student",
  "animal",
  "animals",
  "story",
  "world",
  "lesson",
  "country",
  "music",
  "science",
  "picture",
  "children",
  "garden",
  "rabbit",
  "bird",
  "voice",
  "earth",
  "planet",
  "language",
}


class KeywordHint(BaseModel):
  word: str
  phonetic: str | None = None


class SplitRequest(BaseModel):
  text: str


class SplitResponse(BaseModel):
  sentences: List[str]
  keywords: List[List[KeywordHint]]


class TtsRequest(BaseModel):
  sentence: str


class TtsResponse(BaseModel):
  audio_url: str


class PhoneticResponse(BaseModel):
  phonetic: str


def split_text(text: str) -> List[str]:
  normalized = re.sub(r"\s+", " ", text.strip())
  if not normalized:
    return []
  parts = re.split(r"(?<=[.!?])", normalized)
  return [chunk.strip() for chunk in parts if chunk.strip()]


def looks_like_noun(word: str) -> bool:
  root = word.rstrip("s")
  if word in COMMON_NOUNS or root in COMMON_NOUNS:
    return True
  return any(root.endswith(suffix) for suffix in NOUN_SUFFIXES)


def choose_keywords(sentence: str) -> List[KeywordHint]:
  tokens = re.sub(r"[^a-zA-Z\s]", " ", sentence).lower().split()
  seen: set[str] = set()
  candidates: List[tuple[int, int, int, str]] = []
  for idx, token in enumerate(tokens):
    if token in STOP_WORDS or len(token) <= 4:
      continue
    if token in seen:
      continue
    seen.add(token)
    noun_flag = 0 if looks_like_noun(token) else 1
    candidates.append((noun_flag, idx, -len(token), token))
  candidates.sort()
  return [KeywordHint(word=item[3]) for item in candidates[:2]]


def british_ipa(word: str) -> str:
  normalized = word.lower().strip()
  if not normalized:
    return "/ /"
  if normalized in IPA_CACHE:
    return IPA_CACHE[normalized]

  phonetic = ipa.convert(normalized).strip()
  phonetic = phonetic.replace(" ", "")
  if not phonetic:
    phonetic = normalized
  if not phonetic.startswith("/"):
    phonetic = f"/{phonetic}/"
  IPA_CACHE[normalized] = phonetic
  return phonetic


async def synthesize_sentence(text: str) -> str:
  filename = f"{uuid.uuid4()}.mp3"
  filepath = AUDIO_DIR / filename
  started = time.perf_counter()
  communicator = edge_tts.Communicate(text, VOICE, rate=RATE, volume=VOLUME)
  await communicator.save(str(filepath))
  elapsed = (time.perf_counter() - started) * 1000
  logger.info("tts_synthesized file=%s duration=%.2fms", filename, elapsed)
  cleanup_old_audio()
  return filename


def cleanup_old_audio() -> None:
  global LAST_CLEANUP_TS
  now = time.time()
  if now - LAST_CLEANUP_TS < CLEANUP_INTERVAL_SECONDS:
    return
  LAST_CLEANUP_TS = now
  cutoff = now - AUDIO_RETENTION_SECONDS

  audio_files = sorted(AUDIO_DIR.glob("*.mp3"), key=lambda path: path.stat().st_mtime)
  total = len(audio_files)
  removed = 0
  for path in audio_files:
    try:
      stat = path.stat()
    except FileNotFoundError:
      continue
    if stat.st_mtime < cutoff or total > MAX_AUDIO_FILES:
      try:
        path.unlink(missing_ok=True)
        total -= 1
        removed += 1
      except OSError:
        continue
  if removed:
    logger.info("audio_cleanup removed=%d remaining=%d", removed, total)


@app.post("/split", response_model=SplitResponse)
async def api_split(payload: SplitRequest) -> SplitResponse:
  started = time.perf_counter()
  sentences = split_text(payload.text)
  duration = (time.perf_counter() - started) * 1000
  logger.info(
    "split_text sentences=%d payload_chars=%d duration=%.2fms",
    len(sentences),
    len(payload.text),
    duration,
  )
  return SplitResponse(
    sentences=sentences,
    keywords=[choose_keywords(sentence) for sentence in sentences],
  )


@app.post("/tts", response_model=TtsResponse)
async def api_tts(payload: TtsRequest, request: Request) -> TtsResponse:
  sentence = payload.sentence.strip()
  if not sentence:
    raise HTTPException(status_code=400, detail="sentence is required")
  started = time.perf_counter()
  filename = await synthesize_sentence(sentence)
  audio_url = request.url_for("media_audio", path=filename)
  elapsed = (time.perf_counter() - started) * 1000
  logger.info("tts_request chars=%d duration=%.2fms", len(sentence), elapsed)
  return TtsResponse(audio_url=str(audio_url))


@app.get("/phonetic", response_model=PhoneticResponse)
async def api_phonetic(word: str = Query(..., min_length=1)) -> PhoneticResponse:
  started = time.perf_counter()
  phonetic = british_ipa(word)
  logger.info("phonetic_lookup word=%s duration=%.2fms", word.lower(), (time.perf_counter() - started) * 1000)
  return PhoneticResponse(phonetic=phonetic)
