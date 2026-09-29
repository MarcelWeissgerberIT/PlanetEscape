#!/bin/bash
# Cut the trailer: 8 clips (clips/c1..c8.mp4) with crossfades, then the end card; loudness-normalised.
# usage: cut.sh <lang> [clip seconds]
set -e
cd "$(dirname "$0")"
LANG_=${1:-de}; D=${2:-7}; X=0.5; LAST=8; CARD=6
args=(); for i in 1 2 3 4 5 6 7 8; do args+=(-i clips/c$i.mp4); done
args+=(-loop 1 -t $CARD -i card_$LANG_.png)
f=""; a=""
for i in 0 1 2 3 4 5 6 7; do
  len=$D; [ $i = 7 ] && len=$LAST
  f+="[$i:v]trim=0.2:$(echo "0.2+$len" | bc),setpts=PTS-STARTPTS,scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,fps=30,format=yuv420p,setsar=1[v$i];"
  a+="[$i:a]atrim=0.2:$(echo "0.2+$len" | bc),asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo[a$i];"
done
f+="[8:v]scale=1920:1080,fps=30,format=yuv420p,setsar=1,fade=t=out:st=$(echo "$CARD-1" | bc):d=1[v8];"
# video chain
prev=v0; off=0
for i in 1 2 3 4 5 6 7; do off=$(echo "$off+$D-$X" | bc); f+="[$prev][v$i]xfade=transition=fade:duration=$X:offset=$off[x$i];"; prev=x$i; done
off=$(echo "$off+$LAST-1" | bc); f+="[$prev][v8]xfade=transition=fade:duration=1:offset=$off,fade=t=in:st=0:d=0.6[vout];"
# audio chain: crossfades, the launch roar rings out under the card
prev=a0
for i in 1 2 3 4 5 6 7; do a+="[$prev][a$i]acrossfade=d=$X:c1=tri:c2=tri[y$i];"; prev=y$i; done
total=$(echo "$off+$CARD" | bc)
a+="[$prev]apad,atrim=0:$total,afade=t=in:st=0:d=0.4,afade=t=out:st=$(echo "$total-3" | bc):d=3,loudnorm=I=-14:TP=-1.5:LRA=11[aout]"
ffmpeg -y -loglevel error "${args[@]}" -filter_complex "$f$a" -map "[vout]" -map "[aout]" -c:v libx264 -preset slow -crf 19 -pix_fmt yuv420p -c:a aac -b:a 192k -movflags +faststart trailer_$LANG_.mp4
ffprobe -v error -show_entries format=duration -of csv=p=0 trailer_$LANG_.mp4
