#!/bin/bash
# In-game intro: the 8 clips with crossfades, no end card; fades to black at the end (the menu takes over).
set -e
cd "$(dirname "$0")"
D=7; X=0.5; LAST=8
args=(); for i in 1 2 3 4 5 6 7 8; do args+=(-i clips/c$i.mp4); done
f=""; a=""
for i in 0 1 2 3 4 5 6 7; do
  len=$D; [ $i = 7 ] && len=$LAST
  f+="[$i:v]trim=0.2:$(echo "0.2+$len" | bc),setpts=PTS-STARTPTS,scale=1920:1080,fps=30,format=yuv420p,setsar=1[v$i];"
  a+="[$i:a]atrim=0.2:$(echo "0.2+$len" | bc),asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo[a$i];"
done
prev=v0; off=0
for i in 1 2 3 4 5 6 7; do off=$(echo "$off+$D-$X" | bc); f+="[$prev][v$i]xfade=transition=fade:duration=$X:offset=$off[x$i];"; prev=x$i; done
total=$(echo "$off+$LAST" | bc)
f+="[$prev]fade=t=in:st=0:d=0.6,fade=t=out:st=$(echo "$total-1.2" | bc):d=1.2,format=yuv420p[vout];"
prev=a0
for i in 1 2 3 4 5 6 7; do a+="[$prev][a$i]acrossfade=d=$X:c1=tri:c2=tri[y$i];"; prev=y$i; done
a+="[$prev]afade=t=in:st=0:d=0.4,afade=t=out:st=$(echo "$total-2" | bc):d=2,loudnorm=I=-16:TP=-1.5:LRA=11[aout]"
ffmpeg -y -loglevel error "${args[@]}" -filter_complex "$f$a" -map "[vout]" -map "[aout]" -c:v libx264 -pix_fmt yuv420p -preset slow -crf 17 -c:a pcm_s16le intro_master.mkv
# delivery sizes (two-pass, faststart for streaming)
for spec in "1080:3500k" "720:1800k"; do h=${spec%%:*}; br=${spec##*:}
  ffmpeg -y -loglevel error -i intro_master.mkv -vf scale=-2:$h -c:v libx264 -profile:v high -pix_fmt yuv420p -preset slow -b:v $br -maxrate $br -bufsize $br -pass 1 -an -f mp4 /dev/null
  ffmpeg -y -loglevel error -i intro_master.mkv -vf scale=-2:$h -c:v libx264 -profile:v high -pix_fmt yuv420p -preset slow -b:v $br -maxrate $br -bufsize $br -pass 2 -c:a aac -b:a 128k -movflags +faststart intro_$h.mp4
done
ls -la intro_*.mp4; ffprobe -v error -show_entries format=duration -of csv=p=0 intro_1080.mp4
