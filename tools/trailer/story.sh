#!/bin/bash
# Story clips (8 s, with sound): chN_intro explains chapter N when it starts, chN_done rewards finishing it.
# usage (in tools/trailer, clips/story_chN_{intro,done}.mp4 downloaded): ./story.sh -> ../../public/video/story/
set -e
cd "$(dirname "$0")"
out=../../public/video/story
mkdir -p $out
for f in clips/story_ch*_*.mp4; do
  id=$(basename $f .mp4); id=${id#story_}
  vf="fps=30,scale=-2:720,format=yuv420p"
  af="afade=t=out:st=7.5:d=0.5,loudnorm=I=-18:TP=-2"
  ffmpeg -y -loglevel error -i $f -vf "$vf" -af "$af" -c:v libx264 -profile:v high -preset slow -b:v 1400k -maxrate 1400k -bufsize 1400k -c:a aac -b:a 128k -movflags +faststart $out/${id}_720.mp4
  ffmpeg -y -loglevel error -i $f -vf "$vf" -an -c:v libvpx-vp9 -b:v 1400k -deadline good -cpu-used 4 -row-mt 1 -pass 1 -passlogfile /tmp/story -f webm /dev/null
  ffmpeg -y -loglevel error -i $f -vf "$vf" -af "$af" -c:v libvpx-vp9 -b:v 1400k -deadline good -cpu-used 2 -row-mt 1 -pass 2 -passlogfile /tmp/story -c:a libopus -b:a 96k $out/${id}_720.webm
  echo $id
done
du -sh $out
