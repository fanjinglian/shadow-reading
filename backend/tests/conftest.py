import asyncio
import os
import tempfile

import pytest
from fastapi.testclient import TestClient

from app.main import app, AUDIO_DIR


@pytest.fixture(autouse=True)
def temp_audio_dir(monkeypatch):
    with tempfile.TemporaryDirectory() as tmpdir:
        monkeypatch.setattr('app.main.AUDIO_DIR', AUDIO_DIR.__class__(tmpdir))
        os.makedirs(tmpdir, exist_ok=True)
        yield


@pytest.fixture(scope="session")
def client():
    return TestClient(app)
