# Der Die Das – German articles app (works offline)

## Put it online (free, about 5 minutes)

**Option A: Netlify (easiest, drag and drop)**
1. Unzip `derdiedas.zip` on your computer.
2. Go to https://app.netlify.com/drop and sign up for free.
3. Drag the whole `derdiedas` folder onto the page.
4. You get a link like `https://something-random.netlify.app`. You can rename it under *Site configuration → Change site name*.

**Option B: GitHub Pages**
1. Create a new public repository and upload all the files from the folder.
2. Go to *Settings → Pages → Branch: main → Save*.
3. Your link will be `https://YOURNAME.github.io/REPONAME/`.

## Install it on your phone
- **Android (Chrome):** open the link, tap ⋮, then tap *Install app* or *Add to Home screen*.
- **iPhone (Safari):** open the link, tap Share ⬆️, then tap *Add to Home Screen*.

Open the app once while you're online. After that it works with no internet. Your progress is saved on the phone.

**Audio:** this uses your phone's built-in German voice. If you don't hear anything, install a German voice:
- **Android:** Settings → Text-to-speech
- **iPhone:** Settings → Accessibility → Spoken Content → Voices

## Add your own words
Open `words.js` and add a line in this format:

```
["das","Wasser","—","water","💧","food","A1","Memory trick here","German sentence.","English sentence."],
```

The fields are: article, noun, plural, English, emoji, topic, level, trick, sentence in German, sentence in English. Write `—` as the plural if the word has none.

The topic must be one of: food, home, body, people, travel, city, nature, time, clothes, work, animals, health, freetime, shopping, everyday.

**Then open `sw.js` and change `derdiedas-v1` to `derdiedas-v2`.** If you skip this, phones keep the old version. Upload the files again. The phone picks up the update the next time it's online and you open the app twice.

## Test it on your computer
In the folder, run `python3 -m http.server 8000`, then open http://localhost:8000 in your browser.
