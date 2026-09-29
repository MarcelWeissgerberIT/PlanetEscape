#!/bin/bash
# Menu background: short silent clips of the same conveyor shot (each starts and ends on the same still), encoded one
# by one; the game plays them in random order and fades each into the next (src/ui/menuVideo.ts, MENU_CLIPS).
# usage (in tools/trailer, clips/menu*.mp4 downloaded): ./menu.sh  -> ../../public/video/menu/NN_{1080,720}.{webm,mp4}
set -e
cd "$(dirname "$0")"
ORDER=(menu menu_robot menu_drone menu_critter menu_smoke menu_m01 menu_m02 menu_m03 menu_m04 menu_m05 menu_m06 menu_m07 menu_m08 menu_m09 menu_m10 menu_m11 menu_m12)
out=../../public/video/menu
mkdir -p $out
n=0
for c in "${ORDER[@]}"; do
  n=$((n + 1)); id=$(printf %02d $n)
  [ -f clips/$c.mp4 ] || { echo "$id: clips/$c.mp4 missing"; continue; }
  [ $out/${id}_720.webm -nt clips/$c.mp4 ] && continue # already encoded
  # drop the first/last few frames: they are the shared still and would read as a pause at every change
  for spec in "1080:1800k" "720:900k"; do h=${spec%%:*}; br=${spec##*:}
    vf="trim=0.08:7.92,setpts=PTS-STARTPTS,fps=30,scale=-2:$h,format=yuv420p"
    ffmpeg -y -loglevel error -i clips/$c.mp4 -vf "$vf" -an -c:v libx264 -profile:v high -preset slow -b:v $br -maxrate $br -bufsize $br -movflags +faststart $out/${id}_$h.mp4
    ffmpeg -y -loglevel error -i clips/$c.mp4 -vf "$vf" -an -c:v libvpx-vp9 -b:v $br -deadline good -cpu-used 4 -row-mt 1 -pass 1 -passlogfile /tmp/menu_$h -f webm /dev/null
    ffmpeg -y -loglevel error -i clips/$c.mp4 -vf "$vf" -an -c:v libvpx-vp9 -b:v $br -deadline good -cpu-used 2 -row-mt 1 -pass 2 -passlogfile /tmp/menu_$h $out/${id}_$h.webm
  done
  echo "$id <- $c"
done
du -sh $out
