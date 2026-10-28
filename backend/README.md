# Локальный резолвер OpenMusic

Техническая проба: API ищет запись через yt-dlp и возвращает ссылки на аудио и обложку. Сервер не сохраняет и не проксирует медиа. Ссылки на аудио временные.

## Запуск

Нужны Python 3.12, Deno в `PATH` и доступ к YouTube. Установите Deno по инструкции https://docs.deno.com/runtime/getting_started/installation/; yt-dlp использует его для EJS. Из каталога `openmusic/backend`:

```sh
python3.12 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --host 127.0.0.1 --port 8000
```

В другом терминале из каталога `openmusic`:

```sh
python3 -m http.server 4173 --bind 127.0.0.1 --directory dist
```

Откройте `http://127.0.0.1:4173`, перейдите в Search и отправьте название. Если браузер блокирует автоматический запуск, нажмите Play. Плеер использует прямой поток, а не демозвук при ошибке.

Примеры API:

```sh
curl -X POST http://127.0.0.1:8000/api/v1/resolve -H 'Content-Type: application/json' -d '{"query":"Daft Punk Get Lucky"}'
curl -X POST http://127.0.0.1:8000/api/v1/resolve -H 'Content-Type: application/json' -d '{"video_id":"4D7u5KF7SP8"}'
```

Для тестов: `pip install -r requirements-test.txt`, затем `python -m pytest -q test_resolver.py`; из корня проекта `node --test tests/stream.test.js`.

## Результаты проверки 28 октября 2026

Проверены Python 3.12.14, yt-dlp 2026.10.26, yt-dlp-ejs 0.8.0 и Deno 2.9.8. Тесты API и плеера прошли. Реальные запросы вернули записи: `Daft Punk Get Lucky` — `4D7u5KF7SP8`, `Radiohead No Surprises` — `7374CZQoS2Y`, `Adele Hello` — `Ei8UnOPJX7w`.

Во встроенном браузере Codex для первого трека отображалась обложка, двигался таймлайн, работали пауза и продолжение. Слышимость звука, 30 секунд воспроизведения для каждого из трёх треков, громкость, перемотка и проверка Network пока не подтверждены. Поэтому полная приёмка по ТЗ не завершена; её нужно провести в выбранном локальном браузере с доступным звуковым устройством. Доступность YouTube и временных ссылок зависит от сети и может меняться.
