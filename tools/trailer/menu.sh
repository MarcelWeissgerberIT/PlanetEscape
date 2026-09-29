#!/bin/bash
# Menu background: the conveyor clips (each starts and ends on the same still) in one long sequence, joined with
# short dissolves, silent. The game loops it with a held-frame dissolve (src/ui/menuVideo.ts).
# usage (in tools/trailer, clips/menu*.mp4 downloaded): ./menu.sh  -> ../../public/video/menu_{1080,720}.{webm,mp4}
set -e
cd "$(dirname "$0")"
ORDER=(menu_robot menu menu_drone menu_critter menu_smoke)
X=0.4
args=(); f=""
for i in "${!ORDER[@]}"; do
  args+=(-i clips/${ORDER[$i]}.mp4)
  # drop the first/last few frames: they are the shared still and would show as a pause at every seam
  f+="[$i:v]trim=0.08:7.92,setpts=PTS-STARTPTS,fps=30,format=yuv420p,setsar=1[v$i];"
done
prev=v0; off=0; len=7.84
for ((i = 1; i < ${#ORDER[@]}; i++)); do off=$(echo "$off+$len-$X" | bc); f+="[$prev][v$i]xfade=transition=fade:duration=$X:offset=$off[x$i];"; prev=x$i; done
ffmpeg -y -loglevel error "${args[@]}" -filter_complex "${f}[$prev]null[out]" -map "[out]" -an -c:v libx264 -crf 14 -preset slow menu_master.mp4
out=../../public/video
for spec in "1080:2200k" "720:1100k"; do h=${spec%%:*}; br=${spec##*:}
  ffmpeg -y -loglevel error -i menu_master.mp4 -vf scale=-2:$h -c:v libx264 -profile:v high -pix_fmt yuv420p -preset slow -b:v $br -maxrate $br -bufsize $br -an -movflags +faststart $out/menu_$h.mp4
  ffmpeg -y -loglevel error -i menu_master.mp4 -vf scale=-2:$h -c:v libvpx-vp9 -b:v $br -deadline good -cpu-used 4 -row-mt 1 -pass 1 -passlogfile /tmp/menu_$h -an -f webm /dev/null
  ffmpeg -y -loglevel error -i menu_master.mp4 -vf scale=-2:$h -c:v libvpx-vp9 -b:v $br -deadline good -cpu-used 2 -row-mt 1 -pass 2 -passlogfile /tmp/menu_$h -an $out/menu_$h.webm
done
ffprobe -v error -show_entries format=duration -of csv=p=0 menu_master.mp4
ls -la $out/menu_*
