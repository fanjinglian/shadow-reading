from __future__ import annotations

import os
import re
import uuid
from pathlib import Path
from typing import Dict, List

import edge_tts
import eng_to_ipa as ipa
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

load_dotenv()

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
VOLUME = os.getenv("EDGE_TTS_VOLUME", "+0dB")

IPA_CACHE: Dict[str, str] = {}


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


def choose_keywords(sentence: str) -> List[KeywordHint]:
  tokens = re.sub(r"[^a-zA-Z\s]", " ", sentence).lower().split()
  picks: List[KeywordHint] = []
  for token in tokens:
    if token in STOP_WORDS or len(token) <= 4:
      continue
    if any(existing.word == token for existing in picks):
      continue
    picks.append(KeywordHint(word=token))
    if len(picks) == 2:
      break
  return picks


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
  communicator = edge_tts.Communicate(text, VOICE, rate=RATE, volume=VOLUME)
  await communicator.save(str(filepath))
  return filename


@app.post("/split", response_model=SplitResponse)
async def api_split(payload: SplitRequest) -> SplitResponse:
  sentences = split_text(payload.text)
  return SplitResponse(
    sentences=sentences,
    keywords=[choose_keywords(sentence) for sentence in sentences],
  )


@app.post("/tts", response_model=TtsResponse)
async def api_tts(payload: TtsRequest, request: Request) -> TtsResponse:
  sentence = payload.sentence.strip()
  if not sentence:
    raise HTTPException(status_code=400, detail="sentence is required")
  filename = await synthesize_sentence(sentence)
  audio_url = request.url_for("media_audio", path=filename)
  return TtsResponse(audio_url=str(audio_url))


@app.get("/phonetic", response_model=PhoneticResponse)
async def api_phonetic(word: str = Query(..., min_length=1)) -> PhoneticResponse:
  return PhoneticResponse(phonetic=british_ipa(word))
