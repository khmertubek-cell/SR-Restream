# Deploy HLS Relay Center to Render (10 channels)

## Important: free vs. continuous streaming

Render Free web services are for testing, not 24/7 relaying:
- They spin down after 15 minutes without inbound traffic.
- Their filesystem is ephemeral and resets on restart/redeploy/spin-down.
- Free web services cannot attach persistent disks.
- Free plans do not include background workers.

The included `render.yaml` is therefore a **paid always-on web service** blueprint with a persistent disk. It uses the Standard plan as a starting point for 10 concurrent FFmpeg processes. Actual capacity depends on input codecs/bitrates, network conditions, and viewer traffic; load-test before production. Render bandwidth charges can dominate streaming costs.

## What this deployment provides

- Render Docker web service with FFmpeg installed
- Dashboard and API on the same service
- Persistent channel database and HLS segments under `/var/data`
- Maximum of 10 saved channels and 10 concurrent relays
- Automatic restart of saved channels when the service boots
- HTTPS through Render's managed service URL

## Deploy with a Git repository

1. Extract this project and push the folder contents to a GitHub repository.
2. Sign in to Render and connect your GitHub account.
3. In Render, choose **New → Blueprint**.
4. Select your repository. Render detects `render.yaml`.
5. Review the Blueprint. It creates:
   - one Docker web service using `Dockerfile.render`
   - one 20 GB persistent disk mounted at `/var/data`
   - a generated `ADMIN_PASSWORD`
6. Enter `ADMIN_USER` when prompted (for example, `relayadmin`).
7. Apply the Blueprint and wait for the first deploy to finish.
8. Open the service URL shown in the Render dashboard. Your browser will request HTTP Basic Auth credentials:
   - Username: the `ADMIN_USER` you supplied
   - Password: open the service's Environment page and reveal the generated `ADMIN_PASSWORD`

## Add channels

For each authorized stream:
- Channel name: a readable label
- Channel ID: 2–64 letters/numbers/underscore/hyphen, e.g. `news01`
- Input URL: an authorized HTTP(S), HLS, or RTMP source
- RTMP destination: optional

Click Save channel, then Start. The HLS output is:

`https://YOUR-SERVICE.onrender.com/hls/CHANNEL_ID/index.m3u8`

The service URL is automatically used when `PUBLIC_BASE_URL` is not set.

## Verify deployment

- Health endpoint: `https://YOUR-SERVICE.onrender.com/health`
- Dashboard: `https://YOUR-SERVICE.onrender.com/`
- HLS playlist: `https://YOUR-SERVICE.onrender.com/hls/CHANNEL_ID/index.m3u8`

Use Render Logs to inspect application startup and FFmpeg errors.

## Useful Render controls

- **Logs:** Render service → Logs
- **Restart:** Render service → Manual Deploy → Restart service (or deploy latest commit)
- **Secrets:** Render service → Environment
- **Persistent storage:** Render service → Disks; keep the disk mounted at `/var/data`

## Capacity and cost warning

Ten streams at 2 Mbps each represent about 20 Mbps of incoming traffic. If one viewer watches each channel continuously, that is another ~20 Mbps outbound, about 6.5 TB/month. Actual outbound cost depends on Render's current included bandwidth and overage rate, and scales with viewers. Check Render pricing before publishing streams to an audience.

The Standard plan in this blueprint is only a starting point, not a guarantee that every ten-stream workload will fit. If streams need transcoding, CPU usage can rise dramatically. This project uses FFmpeg stream copy (no transcoding) by default.

## Free preview option

You can create a separate Render Free web service by changing `plan: standard` to `plan: free` and removing the `disk:` block. This is only for dashboard/API experimentation:
- saved channel settings and HLS segments can disappear on restart or spin-down
- the service may sleep after 15 minutes without inbound requests
- it is not suitable for reliable continuous relay

## Security

- Set a unique, long admin password.
- Keep source URLs private; API responses intentionally omit them except for the authenticated config endpoint.
- Only enter stream sources and RTMP destinations you own or are authorized to retransmit.
- This starter uses HTTP Basic Auth; use a unique password and do not share the admin login.
- Avoid putting credentials directly in source URLs if possible; source URLs are stored in the channel JSON file on the persistent disk.
