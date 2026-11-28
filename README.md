# OpenMusic

Музыкальный интерфейс с оригинальными демотреками, поиском YouTube и потоковым
воспроизведением. Гости могут искать и слушать музыку. Вход через Telegram
сохраняет любимые треки и альбомы в MariaDB, плейлисты остаются в localStorage.
Лайк альбома независим от лайков его треков.

## Карточки артистов

Артисты доступны на главной и в библиотеке, по имени в строке трека,
в подборке, в нижнем плеере и через меню трека. На странице артиста есть
баннер, треки, воспроизведение, shuffle и добавление треков в очередь;
на ПК также показан блок с подборкой. Кнопка возврата восстанавливает
поиск и прокрутку. Following, Events и Merch не добавлены.

Шапка артиста YouTube загружается отдельно через `POST /api/v1/artist`: используется
изображение из профиля YouTube Music. ID профиля берётся из результатов поиска;
для ранее сохранённых треков профиль ищется по полному имени. При недоступности
профиля остаётся нейтральный фон с повтором загрузки, обложка трека не подставляется.
Баннер начинается ниже верхней панели, занимает всю ширину контента и плавно
затемняется к трекам на ПК и мобильных. У демоартистов остаются локальные
иллюстрации. Статистика слушателей и биографии не выдумываются.
Для артистов из YouTube используется существующий поиск с постраничной
загрузкой и повтором при ошибке; в профиль попадают только треки с полным
совпадением имени артиста без учёта регистра и лишних пробелов. Артисты с
разным написанием имени и отдельные совместные релизы не объединяются.

Проверки: `npm run check`, `npm test`. Браузерная регрессия с подменённым API:
после запуска `npm start` выполните
`PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node tests/artists-ui.mjs`.

## Локальный запуск

Нужны Python 3.12+, Docker Compose и Deno в PATH для yt-dlp.

```bash
cp .env.example .env
# Заполните DB_PASSWORD и DB_ROOT_PASSWORD разными случайными паролями.
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements-test.txt
docker compose up -d --wait mariadb
python backend/migrate.py
uvicorn --app-dir backend app:app --host 127.0.0.1 --port 8000 --no-access-log
```

Откройте [OpenMusic](http://127.0.0.1:8000). Backend раздаёт `dist/` и `/api`
с одного origin. Поиск, resolver и рекомендации для очереди доступны без БД.
YouTube Music Radio пополняет Up next и показывает рекомендации на Home. До первого запуска трека Home может подобрать радио по последнему лайку. [ТЗ](docs/youtube-music-radio-spec.md)
Если БД недоступна,
операции авторизации/избранного отвечают `503`; интерфейс показывает ошибку и не
подтверждает сохранение. Без Telegram credentials гостевой режим работает,
`/auth/telegram/start` отвечает контролируемым `503`.
Backend и команда миграций читают `.env` из корня проекта при запуске. После
изменения файла перезапустите backend. Переменные, уже заданные в окружении
процесса, имеют приоритет над `.env`.

Миграции запускаются явно, до запуска приложения. Версии записываются в
`schema_migrations`, повторный запуск безопасен; DDL первого этапа допускает
повторение после прерывания. Advisory lock исключает одновременную миграцию.
Не меняйте уже применённые SQL-файлы — добавляйте следующую версию.

Для отдельного локального статического сервера можно запустить `npm start`,
задать `API_BASE = 'http://127.0.0.1:8000'` в `dist/config.js` и включить
`http://127.0.0.1:4173` в `ALLOWED_ORIGINS`. Используйте одинаковый hostname
для frontend/backend: `localhost` и `127.0.0.1` относятся к разным сайтам для
SameSite cookies. CORS допускает credentials только для явно заданных origins.
В production оставляйте `API_BASE = ''`.

## Telegram и HTTPS

По [документации Telegram Login](https://core.telegram.org/bots/telegram-login)
создайте бота и откройте BotFather → Login Widget. Зарегистрируйте origin
сайта и точный callback, например
`https://music.example.com/api/v1/auth/telegram/callback`.
Документация Telegram не гарантирует поддержку `http://127.0.0.1` или
`http://localhost` как Trusted Origin и OIDC Redirect URI для веб-сайта.
Локальный HTTP подходит для разработки приложения и тестов с подменённым
Telegram, но для реального входа используйте публичный HTTPS адрес или HTTPS
туннель к локальному backend. В production сам backend требует единый HTTPS
origin для сайта и API.
Скопируйте Client ID и Client Secret в окружение backend:

```dotenv
APP_ENV=production
PUBLIC_ORIGIN=https://music.example.com
FRONTEND_URL=https://music.example.com
ALLOWED_ORIGINS=https://music.example.com
TELEGRAM_CALLBACK_URL=https://music.example.com/api/v1/auth/telegram/callback
TELEGRAM_CLIENT_ID=...
TELEGRAM_CLIENT_SECRET=...
```

В BotFather оставьте алгоритм подписи **RS256**. Используются Code Flow,
PKCE S256 и scopes `openid profile`, серверная проверка JWKS, `iss`, `aud`,
`exp`, `iat` и одноразового state, привязанного к cookie браузера.
Пользователь определяется парой `iss` + `sub`, username может меняться.
Отдельный UserInfo endpoint не нужен. Callback требует завершить вход в том
же браузере; после ошибки начните вход заново.

Перед backend нужен TLS reverse proxy, например Caddy:

```caddyfile
music.example.com {
    reverse_proxy 127.0.0.1:8000
}
```

Frontend и API должны обслуживаться с одного HTTPS origin; production settings
проверяют это при старте. Не открывайте MariaDB наружу (Compose привязывает порт
к loopback). Запускайте uvicorn одним worker: существующие audio handles находятся
в памяти процесса. Сессии и OAuth state общие для процессов, хранятся в БД.
Сессия действует 30 дней; cookie HttpOnly, SameSite=Lax и Secure в production.
PUT, DELETE и logout требуют разрешённый Origin и session CSRF token из `/auth/me`.
Logout отзывает сессию и удаляет избранное и удалённые треки из памяти интерфейса.

Секреты находятся только в `.env`/secret manager backend. Не публикуйте `.env`,
не добавляйте credentials в `dist/`. Backend удаляет query callback из стандартного
uvicorn access log; в командах выше access log выключен полностью. На reverse proxy
также отключите access log callback или исключите query string: там есть одноразовые
`code` и `state`. Не включайте отладочные HTTP-логи с телами token exchange.

## Избранное и импорт

API под `/api/v1`: `GET /auth/telegram/start`, `GET /auth/telegram/callback`,
`GET /auth/me`, `POST /auth/logout`, `GET /likes?type=track|album&limit=50&offset=0`,
`PUT /likes/{type}/{source}/{source_id}`, `DELETE` по тому же пути.
PUT принимает `title`, `artist`, `cover`, `duration_seconds` (последние два nullable).
`user_id`, аудиоссылки и неизвестные поля запрещены в теле.
Приложение использует `track/youtube` с регистрозависимым 11-символьным
`video_id`. Списки возвращают `{items, has_more}`, новые сверху (дата, затем ID).
Повторный PUT обновляет метаданные без изменения даты. DELETE идемпотентен.

При загрузке коллекции старые демолайки пропускаются. Плейлисты хранятся на
устройстве. Старые числовые ссылки на демотреки пропускаются, YouTube-треки
сохраняются по `video_id` и остаются в исходном порядке.

## Резервная копия и восстановление

После заполнения `.env` создайте логическую копию (содержит персональные данные
и действующие сессии, храните с ограниченным доступом):

```bash
umask 077
docker compose exec -T mariadb sh -c 'MYSQL_PWD="$MARIADB_ROOT_PASSWORD" mariadb-dump -uroot --single-transaction --routines --triggers "$MARIADB_DATABASE"' > openmusic-backup.sql
```

Для восстановления остановите backend, создайте пустую БД с тем же именем
(или используйте новый volume), затем:

```bash
docker compose exec -T mariadb sh -c 'MYSQL_PWD="$MARIADB_ROOT_PASSWORD" mariadb -uroot "$MARIADB_DATABASE"' < openmusic-backup.sql
# Рекомендуется отозвать восстановленные сессии и незавершённые входы:
docker compose exec -T mariadb sh -c 'MYSQL_PWD="$MARIADB_ROOT_PASSWORD" mariadb -uroot "$MARIADB_DATABASE" -e "DELETE FROM sessions; DELETE FROM oauth_states;"'
python backend/migrate.py
```

Запустите backend и войдите заново. Проверьте любимые треки и альбомы.
Не запускайте восстановление поверх работающего приложения. Для проверки backup
используйте отдельную MariaDB с пустой БД. `docker compose down` сохраняет volume;
`down -v` удаляет данные.

## Проверки

```bash
npm run check
npm test
python -m pytest -q backend
```

Без `TEST_DB_NAME` интеграционные тесты MariaDB пропускаются. Для полной проверки
создайте **отдельную одноразовую** БД, имя которой заканчивается на `_test`, выдайте
`DB_USER` права на неё и задайте `TEST_DB_NAME` и параметры подключения. Тесты
удаляют данные из users/sessions/likes/oauth_states этой БД!

Пример отдельного контейнера:

```bash
docker run -d --name openmusic-mariadb-test -e MARIADB_ROOT_PASSWORD=test-only -e MARIADB_DATABASE=openmusic_test -e MARIADB_USER=openmusic -e MARIADB_PASSWORD=test-only -p 127.0.0.1:3307:3306 mariadb:11.4.8
# Дождитесь готовности healthcheck.sh --connect --innodb_initialized.
DB_HOST=127.0.0.1 DB_PORT=3307 DB_USER=openmusic DB_PASSWORD=test-only TEST_DB_NAME=openmusic_test python -m pytest -q backend
```

JWT-тесты используют локальные RSA-ключи, а SQL выполняется в настоящей MariaDB.
Они проверяют PKCE, state/replay, подпись и claims, сессии, изоляцию,
CSRF, конкуренцию, пагинацию, регистр ID и отказ БД. Они не заменяют реальный
Telegram-вход. Статус приёмки и оставшиеся ручные сценарии:
[docs/mariadb-likes-telegram-acceptance.md](docs/mariadb-likes-telegram-acceptance.md).
Подробности поиска, аудиопрокси и yt-dlp: [backend/README.md](backend/README.md).

Дополнительная проверка интерфейса в Chrome (с тестовыми ответами API, без
реального Telegram) запускается отдельно от `npm test`:

```bash
# Сначала запустите npm start в другом терминале.
npm install --prefix /tmp/openmusic-ui-test playwright@1.58.2
PLAYWRIGHT_MODULE=/tmp/openmusic-ui-test/node_modules/playwright/index.mjs node tests/recommendations-ui.mjs
```

По умолчанию тест использует `/usr/bin/google-chrome` и порт 4173.
Их можно переопределить через `CHROME_PATH` и `UI_TEST_ORIGIN`.
