# Trailer and intro

AI-generated (declare in the Steam content survey): start frames with Nano Banana Pro from the game's own story
art, animated with Veo 3.1 including sound effects and score (OpenArt). `clips.json` lists the source clips.

```bash
cd tools/trailer
node -e "for (const c of require('./clips.json').clips) console.log(c.url, c.id)" | while read u id; do curl -sS -o clips/$id.mp4 $u; done
node card.mjs card_de.png de && node card.mjs card_en.png en   # end cards (run from tools/trailer)
./cut.sh de && ./cut.sh en      # store trailers with end card (trailer_<lang>.mp4, ~58 s)
./intro.sh                      # in-game intro without end card (intro_1080.mp4 / intro_720.mp4, ~53 s)
./menu.sh                       # menu background: 5 conveyor clips with small events, joined (~37 s, silent)
```

The game plays `public/video/intro_*.{webm,mp4}` on the first start (skippable, again via "Watch the intro" in the
menu) and loops `public/video/menu_*` silently behind the main menu, with a held-frame dissolve at the seam
(`src/ui/menuVideo.ts`) instead of `<video loop>`, which stalls briefly when it jumps back. WebM (VP9) comes first, MP4 (H.264) is the fallback for Safari.
