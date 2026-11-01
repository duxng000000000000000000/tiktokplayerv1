# Afterglow — TikTok Audio Player

A lightweight, static browser audio player with three calm themes (Midnight, Moss, Dusk).

## Features

- Extracts the audio stream from a TikTok **video URL** using the video's playback URL. It does not use TikTok's separate attached-music field.
- Extracts audio from a local video file when the browser cannot fetch the remote video.
- Uses FFmpeg.wasm with `-c:a copy` to copy the original audio stream into an M4A container without re-encoding. If the source codec cannot be copied into that container, extraction fails instead of silently converting the audio.
- Offline playlist stored locally in IndexedDB, play/pause, seek, previous/next, shuffle, repeat-one/repeat-all, sleep timer, and Media Session controls.
- Uses a single-thread FFmpeg core, so GitHub Pages does not need `SharedArrayBuffer` or cross-origin isolation headers.
- Clears the old MusicBaby audio store and the new Afterglow library once on the next app load, removing imported test tracks. It does not copy old playlist items into the new library. The new interface uses generated CSS artwork and has no personal-photo references.

## Deploy on GitHub Pages

In the repository settings, open **Pages**, choose **Deploy from a branch**, select **main** and **/(root)**, then save. Open the Pages URL over HTTPS.

## Audio extraction notes

TikTok playback links and third-party API responses can change. A browser may also block cross-origin video downloads (CORS). In that case, download a video you own or have permission to use and select it under **Local video**. FFmpeg.wasm then extracts the audio locally in the browser.

Stream copy preserves the encoded audio data; it cannot improve the source quality. Not all audio codecs can be placed into an M4A container without re-encoding, so this build reports an error rather than changing the audio.

The first extraction loads the single-thread FFmpeg WebAssembly engine from a public CDN and may take a little time. The single-thread core avoids the `SharedArrayBuffer` requirement that blocked the earlier build on GitHub Pages. Video processing is memory-intensive; files above 150 MB are rejected to reduce browser crashes.
