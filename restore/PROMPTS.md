# Реставрация бюстов: «как будто только что изваяли»

Генеративная модель дорисовывает утраченное (носы, сколы, трещины) по образу оригинала и сохраняет лицо, причёску и ракурс. Лучше всего это получается в **ChatGPT** (генерация изображений) и **Google Gemini** (редактирование фото).

## Как сделать

1. Откройте ChatGPT или Gemini и приложите исходное фото из `assets/src/` (имя файла указано у каждого бюста).
2. Вставьте общий промпт, подставив в него строку «Что восстановить».
3. Если лицо «уплыло» и стало непохожим, попросите: *Keep the face exactly as in the reference, only repair the damage.*
4. Сохраните результат в `restore/out/` под именем из скобок, например `restore/out/zeno.png`.
5. Скажите мне. Я выполню `python3 assets/process.py restored`, вырежу фон, тонирую и поставлю бюсты на сайт.

## Общий промпт

```
Use the attached photo as the exact reference. Digitally restore this ancient marble portrait bust so it looks as if the sculptor had just finished it: complete and undamaged. {ЧТО ВОССТАНОВИТЬ} Remove all stains, patina, discoloration, cracks and chips. Fresh, softly polished white Carrara marble with very subtle grey veining. Keep the identity exactly: same facial features, proportions, expression, hairstyle, beard, head angle, framing and composition as the reference. Photorealistic museum photograph, soft diffused daylight from the upper left, gentle shadows, ultra-detailed carving, sharp focus. Plain flat uniform light-grey background (#B4B0A8), nothing else in the frame, no label, no text, no watermark. Vertical 3:4.
```

## Что восстановить

| Бюст | Исходник | Сохранить как | Что восстановить |
|---|---|---|---|
| Марк Аврелий | `assets/src/marcus.jpg` | `marcus.png` | `The bust is almost intact: blend the old repair seam on the nose tip, remove the reddish reflections from the wall, keep every curl of the hair and beard.` |
| Зенон Китийский | `assets/src/zeno.jpg` | `zeno.png` | `Rebuild the missing nose as a straight Greek nose that continues the brow line, repair the chipped forehead and beard. Do not add a pedestal.` |
| Клеанф | `assets/src/cleanthes.jpg` | `cleanthes.png` | `The head is heavily damaged: rebuild the nose, the eyes and eyelids, the cheeks and the mouth of an old man with deep wrinkles and a full beard, add the neck and a simple draped bust below, keep the bald crown.` |
| Хрисипп | `assets/src/chrysippus.jpg` | `chrysippus.png` | `Rebuild the broken nose tip and chipped eyebrows, keep the furrowed brow, the balding head, the beard and the draped cloak.` |
| Сенека | `assets/src/seneca.png` | `seneca.png` | `Repair the chipped nose and the worn surface, keep the carved ancient inscription SENECA on the chest.` |

## По желанию: воображаемые портреты

Подлинных портретов этих мыслителей не сохранилось. Если их сгенерировать, на сайте я подпишу их как воображаемые.

| Мыслитель | Опора | Сохранить как | Промпт вместо «что восстановить» |
|---|---|---|---|
| Эпиктет | `assets/src/epictetus.jpg` (гравюра 1715 г.) | `epictetus.png` | `Create a marble portrait bust of the elderly Greek philosopher shown in this engraving: curly hair, long full beard, thoughtful face, simple tunic.` (из общего промпта уберите «Keep the identity… composition») |
| Мусоний Руф | без исходника | `musonius.png` | `A Roman Stoic philosopher of the 1st century AD, middle-aged, short curly beard, calm stern face, toga.` |
| Иерокл | без исходника | `hierocles.png` | `A Greek Stoic philosopher of the 2nd century AD, curly hair, medium beard, kind attentive face, himation.` |
