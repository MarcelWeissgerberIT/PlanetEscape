# Trailer and intro

AI-generated (declare in the Steam content survey): start frames with Nano Banana Pro from the game's own story
art, animated with Veo 3.1 including sound effects and score (OpenArt). `clips.json` lists the source clips.

```bash
cd tools/trailer
node -e "for (const c of require('./clips.json').clips) console.log(c.url, c.id)" | while read u id; do curl -sS -o clips/$id.mp4 $u; done
node card.mjs card_de.png de && node card.mjs card_en.png en   # end cards (run from tools/trailer)
./cut.sh de && ./cut.sh en      # store trailers with end card (trailer_<lang>.mp4, ~58 s)
./intro.sh                      # in-game intro without end card (intro_1080.mp4 / intro_720.mp4, ~53 s)
./menu.sh                       # menu background: 17 silent conveyor clips, one file each (public/video/menu/)
./story.sh                      # story clips with sound, 720p (public/video/story/chN_{intro,done})
```

The game plays `public/video/intro_*.{webm,mp4}` on the first start (skippable, again via "Watch the intro" in the
menu) and plays the clips in `public/video/menu/` silently behind the main menu in random order: they all start and
end on the same still, so each fades into the next without a seam (`src/ui/menuVideo.ts`, two players taking turns;
`MENU_CLIPS` there must match the number of clips). Each story chapter has two 8 s clips with sound
(`src/ui/storyVideo.ts`): `chN_intro` in the briefing card at the chapter start, `chN_done` in the chapter-complete
card (chapter 7: the launch card); the chapter select can replay both. WebM (VP9) comes first, MP4 (H.264) is the fallback for Safari.
