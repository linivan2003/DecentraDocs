## Overview

This project runs three main services on a single EC2 instance:
1. nginx for reverse proxy that terminates TLS and routes traffic by domain name
2. dex as an OIDC IdP shim (lets you use any IdP w/o frontend changes) via docker
3. coturn as a STUN/TURN server again via docker (NOTE: need host networking, if you follow coturn spec it trys to build 16k addr NAT table which takes like 1 hour on t3.micro)
4. websocket signaling servermanaged by systemd
5. static front-end served by nginx

---

## DNS layout

Each service is exposed via its own subdomain
All DNS is configured in Cloudflare (which only i can access, don't think cloudflare has IAM equavialent)

| Service | Domain | Notes |
|---------|--------|-------|
| Frontend | decentradocs.emmettlsc.com | Proxied through Cloudflare |
| Signaling | signal.emmettlsc.com | Proxied through Cloudflare |
| OIDC (Dex) | dex.emmettlsc.com | Proxied through Cloudflare |
| TURN/STUN | turn.emmettlsc.com | Not proxied |

---

## Nginx reverse proxy

Nginx listens on ports 80/443 and proxies based on the server_name

Each service has a config under `/etc/nginx/sites-available/`

For Dex:

```nginx
server {
    server_name dex.emmettlsc.com;

    location / {
        proxy_pass http://127.0.0.1:5556;
        proxy_set_header Host $host;
    }
}
```

For signaling:

```nginx
server {
    server_name signal.emmettlsc.com;

    location / {
        proxy_pass http://127.0.0.1:7000;
        proxy_set_header Host $host;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

For the frontend:

```nginx
server {
    server_name decentradocs.emmettlsc.com;
    root /srv/app/dist;
}
```

After adding configs:

```bash
sudo ln -s /etc/nginx/sites-available/<name> /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## Dex OIDC provider

Dex runs in Docker using a single config file

Directory structure:

```
/srv/dex/
    config.yaml
    data/
    docker-compose.yaml
```

config.yaml contains OIDC connectors and client definitions, this is where you add support for more than just google which is suported now. data/ is mounted for the container to maintain some sqlite db

Start Dex:

```bash
cd /srv/dex
docker-compose up -d
```

Dex listens on port 5556 locally
Nginx proxies dex.emmettlsc.com --> localhost:5556

---

## TURN/STUN w/ coturn

coturn is run using the coturn/coturn image
NOTE: must use host networking so that coturn can bind directly to UDP ports

Directory:

```
/srv/turn/
    turnserver.conf
```

Start coturn:

```bash
docker run -d \
  --name turn \
  --network host \
  -v /srv/turn/turnserver.conf:/etc/turnserver.conf \
  coturn/coturn
```

Ports exposed directly to the internet:
- 3478/udp (STUN/TURN)
- 3478/tcp
- 5349/udp (optional)
- 5349/tcp (optional)
- 49152–65535/udp (the relay ports)

DNS for turn.emmettlsc.com must be "DNS only" in Cloudflare

To verify coturn is working, you can use the Trickle ICE tool (but to do this the turnserver.conf needs to have `lt-cred-mech` set)
https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/

---

## Signaling server

signaling server listens on port 7000 (but nginx proxies to it)

Create a systemd service:

```
/etc/systemd/system/signal.service

[Unit]
Description=WebRTC signaling server
After=network.target

[Service]
WorkingDirectory=/srv/signal
ExecStart=/usr/bin/node server.js
Restart=always
User=ubuntu
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

Commands:

```bash
sudo systemctl daemon-reload
sudo systemctl enable signal
sudo systemctl start signal
sudo systemctl status signal
```

nginx proxies signal.emmettlsc.com --> localhost:7000.

---

## Frontend

frontend is built into a static directory and served by nginx

Example:

```bash
# After building
cp -r build/ /srv/app/dist
```

nginx serves decentradocs.emmettlsc.com from /srv/app/dist