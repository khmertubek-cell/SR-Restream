# HLS Relay Center

A self-hosted dashboard inspired by the supplied screenshot. It uses Express for the control panel/API and FFmpeg for HLS packaging.

## Requirements

- Docker (recommended), or Node.js 20+ and FFmpeg installed on the host.
- A machine that can stay online while streams are running.
- Permission to receive and retransmit every source stream.

## Run with Docker

```bash
docker build -t hls-relay-center .
docker run -d \
  --name hls-relay \
  --restart unless-stopped \
  -p 5081:5081 \
  -e ADMIN_USER=admin \
  -e ADMIN_PASSWORD='use-a-long-unique-password' \
  -e PUBLIC_BASE_URL='http://YOUR_SERVER_IP:5081' \
  -v "$PWD/data:/app/data" \
  -v "$PWD/hls:/app/hls" \
  hls-relay-center
```

Open `http://YOUR_SERVER_IP:5081`. Your browser will request the Basic Auth credentials.

## Run without Docker

```bash
npm install
# Install FFmpeg separately and make sure `ffmpeg -version` works.
ADMIN_USER=admin ADMIN_PASSWORD='use-a-long-unique-password' PORT=5081 npm start
```

## Add a channel

Enter a channel name, unique ID, and an input URL such as an authorized `.m3u8`, HTTP media stream, or RTMP source. Press **Save channel**, then **Start**.

Output URL:

```text
http://YOUR_SERVER_IP:5081/hls/CHANNEL_ID/index.m3u8
```

Set `PUBLIC_BASE_URL` to the externally reachable base URL if the output URL should use a public domain.

## Notes and limitations

- This starter uses stream copy (`-c copy`) to reduce CPU usage. Inputs must contain codecs/container streams compatible with HLS MPEG-TS. If the source is incompatible, FFmpeg may exit; inspect the server logs.
- HLS segments are written to the `hls/` directory. Keep that directory persistent and ensure sufficient disk space.
- Viewer counts are placeholders. Accurate viewer analytics require logging requests at a reverse proxy/CDN.
- Editing a channel requires re-entering its input URL because credentials and source URLs are deliberately not sent back to the browser.
- This is a starter implementation, not a hardened public multi-user service. Put it behind HTTPS, use a strong password, restrict network access, and consider a reverse proxy/rate limits before exposing it publicly.
- Never use this to redistribute streams without permission.
- A free sleeping web host is not suitable for a continuous relay. Use an always-on host for FFmpeg; a free static host can serve a separate dashboard, but it cannot run the relay process.
\n\n## Render deployment\n\nSee [RENDER-DEPLOY.md](RENDER-DEPLOY.md). The included `render.yaml` provisions a paid always-on service with a persistent disk; Render Free is only appropriate for a non-production preview.\n