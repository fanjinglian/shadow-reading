from unittest import mock

from fastapi.testclient import TestClient


def test_split_sentence_and_keywords(client: TestClient):
    response = client.post('/split', json={'text': 'Tom loves science? Rabbits love gardens?'})
    assert response.status_code == 200
    body = response.json()
    assert body['sentences'] == ['Tom loves science?', 'Rabbits love gardens?']
    assert len(body['keywords']) == 2
    assert any('science' in kw['word'] for kw in body['keywords'][0])


def test_phonetic_returns_brackets(client: TestClient):
    response = client.get('/phonetic', params={'word': 'animals'})
    assert response.status_code == 200
    body = response.json()
    assert body['phonetic'].startswith('/') and body['phonetic'].endswith('/')


def test_tts_returns_audio_url(client: TestClient):
    mock_audio_name = 'test-audio.mp3'
    with mock.patch('app.main.synthesize_sentence', return_value=mock_audio_name):
        response = client.post('/tts', json={'sentence': 'Hello world.'})
    assert response.status_code == 200
    audio_url = response.json()['audio_url']
    assert mock_audio_name in audio_url


def test_word_tts_endpoint(client: TestClient):
    mock_audio_name = 'word-audio.mp3'
    with mock.patch('app.main.synthesize_sentence', return_value=mock_audio_name):
        response = client.get('/word-tts', params={'word': 'animals'})
    assert response.status_code == 200
    audio_url = response.json()['audio_url']
    assert mock_audio_name in audio_url


def test_cleanup_old_audio(tmp_path, monkeypatch):
    from app import main

    monkeypatch.setattr(main, 'AUDIO_RETENTION_SECONDS', 0)
    monkeypatch.setattr(main, 'MAX_AUDIO_FILES', 1)
    monkeypatch.setattr(main, 'CLEANUP_INTERVAL_SECONDS', 0)

    audio_dir = tmp_path / 'audio'
    audio_dir.mkdir()
    monkeypatch.setattr(main, 'AUDIO_DIR', audio_dir)

    file_one = audio_dir / 'old.mp3'
    file_two = audio_dir / 'new.mp3'
    file_one.write_bytes(b'old')
    file_two.write_bytes(b'new')

    main.cleanup_old_audio()
    remaining = list(audio_dir.glob('*.mp3'))
    assert len(remaining) <= 1
