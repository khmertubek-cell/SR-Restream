# Deploy on a free Ubuntu VPS (70-channel trial deployment)

## Important capacity warning

Oracle Cloud Always Free currently includes up to 2 Ampere A1 OCPUs and 12 GB RAM (subject to account, home-region, and capacity limits). This is suitable for a pilot, not a guarantee that 70 live channels plus viewers will run reliably. At 70 inputs averaging 2 Mbps, input traffic alone is about 140 Mbps. One viewer per channel at the same bitrate adds about 140 Mbps outbound. Each additional viewer adds more egress. Check provider network/egress terms and measure actual throughput before relying on it.

## A. Create the VPS

1. Create an Oracle Cloud Free Tier account: https://www.oracle.com/cloud/free/
2. Choose a home region near your stream sources and viewers, where Always Free A1 capacity is available.
3. Create a Compute VM using an Ubuntu 24.04 image marked Always Free Eligible.
4. Choose VM.Standard.A1.Flex, 2 OCPUs and 12 GB RAM (the Always Free A1 allowance). Use a boot volume within the account's 200 GB total Always Free block-volume allowance.
5. Assign a public IPv4 address. Save the public IP and SSH private key securely.
6. In the VCN security list or network security group, allow inbound TCP 22 from your own IP, TCP 80 from the internet, and TCP 443 from the internet. Do not expose port 5081 publicly.
7. Create a DNS A record such as `relay.yourdomain.com` pointing to the VPS public IPv4. HTTPS needs a real hostname and reachable ports 80/443.

Oracle documents the Always Free A1 allowance as 1,500 OCPU-hours and 9,000 GB-hours per month, equivalent to 2 OCPUs and 12 GB RAM; capacity can be unavailable in a home region. See Oracle's Always Free resources documentation.

## B. Connect and upload the project

From your computer, in the folder containing this project:

```bash
scp -i /path/to/private-key -r hls-relay-center ubuntu@YOUR_VPS_IP:~/
ssh -i /path/to/private-key ubuntu@YOUR_VPS_IP
```

Then on the VPS:

```bash
cd ~/hls-relay-center
cp .env.example .env
nano .env
```

Set these values:

```dotenv
DOMAIN=relay.yourdomain.com
PORT=5081
ADMIN_USER=admin
ADMIN_PASSWORD=PASTE_A_LONG_UNIQUE_PASSWORD
PUBLIC_BASE_URL=https://relay.yourdomain.com
```

The hostname must resolve to this VPS before starting Caddy. Keep `.env` private; it contains the admin password.

## C. Deploy

```bash
sudo bash deploy-ubuntu.sh
```

The script installs Docker Engine from Docker's official Ubuntu apt repository if Docker is missing, then builds and starts the relay and Caddy HTTPS reverse proxy.

Open `https://relay.yourdomain.com`. The API will request the Basic Auth username and password configured in `.env`.

## D. Add channels

In the dashboard, add each channel with:
- A unique ID using letters, numbers, `_` or `-` (2–64 characters)
- A source URL you are authorized to relay
- Optional RTMP destination

Start one channel first. Confirm its output at:

`https://relay.yourdomain.com/hls/CHANNEL_ID/index.m3u8`

Then add and start more channels in batches (for example 5, then 10, then 20, then all 70), watching CPU, RAM, network throughput, and FFmpeg logs. Do not assume all 70 are stable until a sustained test passes.

## E. Operations

```bash
cd ~/hls-relay-center
sudo docker compose ps
sudo docker compose logs -f relay
sudo docker compose logs -f caddy
sudo docker compose restart relay
sudo docker compose pull caddy && sudo docker compose up -d
```

Back up channel definitions and HLS state:

```bash
sudo tar -czf relay-backup-$(date +%F).tar.gz data hls .env
```

Monitor disk usage. HLS segments are stored in `./hls`; the app uses an eight-segment rolling playlist per channel, but segment retention and source failures should still be monitored.

## F. Firewall on the VM

The cloud network security rules are the primary ingress control. Also enable the host firewall, allowing SSH, HTTP and HTTPS only:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status
```

Do not publish TCP 5081 directly. The app is only exposed inside the Docker network; Caddy handles public HTTP/HTTPS.

## G. Important limitations

- The current project is a starter relay, not a hardened broadcast platform. Test only streams you own or are licensed to redistribute.
- The dashboard's viewer count is a placeholder, not actual analytics.
- Stream copy (`-c copy`) reduces CPU but source codecs must be compatible with MPEG-TS/HLS.
- The app currently runs one FFmpeg process per channel. Seventy sources and viewer egress may exceed free-tier compute, network, storage I/O, or provider fair-use limits.
- Do not use free trial credits as a promise of permanently free production capacity. Monitor billing and set budget alerts if you move to paid resources.
