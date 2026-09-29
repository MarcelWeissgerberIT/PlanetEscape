Steam files for the desktop app

steam_appid.txt          the game's Steam App ID (one number). Build with it and the app talks to Steam
                         (achievements, overlay); without it the app runs without Steam. The desktop workflow
                         writes it from its "steam_app_id" input.
app_build.vdf.template   SteamPipe build script: copy to app_build.vdf, fill in the app and depot ids.
upload.sh                uploads desktop/release/*-unpacked with steamcmd (STEAM_USER=<build account>).

See STEAM.md in the repository root for the whole checklist.
