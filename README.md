# JugaBet — Safe Cracking playable

Портретная мини-игра (пропорции фрейма Figma 1089×1920): 3 нажатия на замок → сейф открывается → попап с бонусом и CTA.
Первое нажатие всегда «ломает» диск (иллюзия выбора, «¡Inténtalo de nuevo!»), второе и третье успешны, на третьем сломанный диск чинится.
Без фреймворков: HTML + CSS + ~300 строк JS (Web Animations API).

## Сборка

```bash
npm install
npm run build                                   # -> dist/index.html (один файл, ~450 KB)
node tools/build.mjs --amount=125 --unit="giros gratis" --url=https://landing.example
```

Параметры кампании и все тексты (испанский) лежат в [src/config.js](src/config.js): `bonusAmount`, `bonusUnit`, `clickUrl`, `locale`, `text`.
Флаги `--amount`, `--unit`, `--url` переопределяют их при сборке. Длинные тексты автоматически ужимаются по ширине (`data-max` в разметке).

## Разработка

```bash
npm run dev            # http://localhost:8765/src/index.html
```

Для QA можно сразу открыть нужное состояние: `?state=1`, `?state=2`, `?state=popup`.

## Структура

- `figma-src/` — исходники из Figma (как есть)
- `tools/prepare_assets.py` — нарезка и сжатие в WebP: лицевая часть замка (шкала + спицы) вырезана из картинки сейфа и выпрямлена из перспективы в круг, ступица с логотипом — отдельный неподвижный слой; панель «TAPS LEFT» разложена на слои (полоса / монеты / галочки)
- `src/` — игра; `src/ad.js` — адаптер сетей: MRAID (AppLovin, Unity, Vungle…), ironSource `dapi`, Mintegral, Google `ExitApi`, Meta `FbPlayableAd`, иначе `window.open`
- `dist/index.html` — готовый файл для загрузки в сеть
