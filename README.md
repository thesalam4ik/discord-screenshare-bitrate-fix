# discord-screenshare-bitrate-fix

Fixes Discord screen share stuck at ~500 kbps on macOS 27 Golden Gate.

## Problem

On macOS 27 Discord's screen share looks terrible at any resolution. The webrtc logs
(`~/Library/Application Support/discordcanary/logs/discord-webrtc_0`) show why:

- network is fine: BWE 8–9 Mbps, 0% loss
- encoder config is `min 500k / target 600k / max 3.5M`, but the encoder never leaves ~500 kbps
- VideoToolbox "recon frames" fail 100% of the time (`recon frames successful: 0, failed: 149691`)

Discord's rate controller uses those reconstructed frames to compute VMAF and decide whether to
raise bitrate. With garbage VMAF it sits at the minimum forever. Nothing in Discord's settings
changes this.

## Fix

Bitrates are passed from Discord's JS to the native engine through
`setTransportOptions(options)` in `discord_voice/index.js`. The patcher wraps that call and
forces `encodingVideoMinBitRate` / `streamParameters[].minBitrate` (and raises the max to match).
The encoder is not allowed to go below the min, so the broken controller no longer matters.

Result on a Mac mini M4: target rate ~6 Mbps, VMAF 87–95 instead of 500 kbps.

## Usage

Quit Discord fully, then:

```bash
node patch-discord-voice.js --min 6000   # kbps, default 4000
```

Start Discord and share your screen. Every intercepted call is logged to
`~/Library/Logs/scfix.log` (BEFORE/AFTER). Verify:

```bash
grep -h "Outbound video stats" ~/Library/Application\ Support/discordcanary/logs/discord-webrtc_0 | grep -oE "target rate: [0-9]+" | tail -3
```

Undo:

```bash
node patch-discord-voice.js --undo
```

Notes:

- Patches Canary, Stable and PTB, whichever are installed (newest `app-*` dir).
- Discord overwrites `index.js` when it updates modules. Just re-run the patcher.
- Pick `--min` below your real upload bandwidth.
