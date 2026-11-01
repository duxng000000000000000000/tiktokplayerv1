# Afterglow — TikTok Video Player

A lightweight, static TikTok video player with three calm themes (Midnight, Moss, Dusk).

## Features

- Embeds public TikTok video and photo/slideshow posts with TikTok's official Embed Player.
- Supports full TikTok post URLs and attempts to resolve shortened share links through TikTok oEmbed, with TikWM as a fallback resolver.
- Saves a personal playlist of TikTok post links in IndexedDB. The playlist remains in the same browser on the same device after reload.
- Play/pause, seek, previous/next, shuffle, repeat-one/repeat-all, sleep timer, and Media Session action handlers.
- Midnight, Moss, and Dusk themes.
- No video downloading, audio extraction, FFmpeg, or local audio files. An internet connection is required to stream TikTok posts.

## Embed Player limitations

Playback, availability, autoplay, and background behavior are controlled by TikTok and the browser. Private, removed, restricted, or non-embeddable posts may not play. Browsers can block autoplay; use the play button inside the TikTok player when that happens.

TikTok's documented Embed Player messaging API supports play, pause, and seek, and reports playback state and current time. It does not document a command for setting an arbitrary volume level, so the sleep timer pauses playback rather than fading the volume gradually. Media Session controls are best-effort and may vary by browser and device.

The playlist stores TikTok post IDs and URLs, not downloaded media. It is not an offline video library.

## Deploy on GitHub Pages

In the repository settings, open **Pages**, choose **Deploy from a branch**, select **main** and **/(root)**, then save. Open the Pages URL over HTTPS.
