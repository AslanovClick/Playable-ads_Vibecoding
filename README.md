# JugaBet — Fan of Cards playable

Портретная мини-игра (пропорции фрейма Figma 1089×1920), концепт «Fan of Cards (Blind Choice)»:
веер из 5 карт рубашкой вверх «дышит», рука подсказывает тап → игрок выбирает любую карту →
остальные растворяются в тени, выбранная выезжает вперёд и переворачивается → приз светится на лицевой стороне, за картой пролетает золотая световая дуга (canvas, без картинки),
плашка «TU BONO: 125 GIROS GRATIS» и кнопка «RECLAMAR BONO».
Без фреймворков: HTML + CSS + JS (Web Animations API).

## Сборка

```bash
npm install
npm run build                                   # -> dist/index.html (один файл, ~200 KB)
node tools/build.mjs --amount=125 --unit="giros gratis" --url=https://landing.example
```

Параметры кампании и все тексты (испанский) лежат в [src/config.js](src/config.js): `bonusAmount`, `bonusUnit`, `clickUrl`, `locale`, `text`.
Флаги `--amount`, `--unit`, `--url` переопределяют их при сборке. Длинные тексты автоматически ужимаются по ширине (`data-max` в разметке).

## Разработка

```bash
npm run dev            # http://localhost:8765/src/index.html
```

Для QA: `?pick=0..4` сразу выбирает карту, `&hold=1` останавливает игру на раскрытой карте (без финала с кнопкой).
С `?pick=` в консоли доступна `__swirlAt(0..1)` — рисует световую дугу вокруг карты в заданный момент её жизни.

## Структура

- `figma-src/` — исходники из Figma (как есть)
- `tools/prepare_assets.py` — нарезка и сжатие в WebP. Лицевая сторона карты выпрямляется (в Figma она наклонена на 11,38°), из неё вырезается только золотая рамка: сияющий фон и надпись «BONO: 5000 MXN» были нарисованы в картинке, теперь фон собран в CSS, а сумма — живой текст
- `src/` — игра; `src/ad.js` — адаптер сетей: MRAID (AppLovin, Unity, Vungle…), ironSource `dapi`, Mintegral, Google `ExitApi`, Meta `FbPlayableAd`, иначе `window.open`
- `dist/index.html` — готовый файл для загрузки в сеть
