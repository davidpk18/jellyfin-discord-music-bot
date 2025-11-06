<p align="center">
  <a href="https://jellyfin.org/" target="_blank">
    <img src="https://github.com/walkxcode/dashboard-icons/blob/main/png/jellyfin.png?raw=true" width="200" alt="Jellyfin Logo" />
  </a>
</p>

<h1 align="center">Jellyfin Discord Music Bot — Redux 🎶</h1>

<p align="center">
  A fork of <a href="https://github.com/manuel-rw/jellyfin-discord-music-bot" target="_blank">Manuel-RW’s Jellyfin Discord Music Bot</a>, with a new <code>/browse</code> command and a more robust search system.
  <br/>Massive thanks to <strong>Manuel</strong> for the original project.
</p>

<p align="center">
  <a href="https://github.com/manuel-rw/jellyfin-discord-music-bot/wiki/%F0%9F%9A%80-Installation">
    <img src="https://img.shields.io/badge/-Installation%20Guide-7289da?style=for-the-badge&logo=markdown" alt="Installation Badge" />
  </a>
  <a href="https://discord.gg/hRHZ3q3VDX">
    <img src="https://img.shields.io/badge/-Community%20Discord-7289da?style=for-the-badge&logo=discord" alt="Community Discord" />
  </a>
  <a href='https://ko-fi.com/A0A42YZ7W' target='_blank'>
    <img src="https://img.shields.io/badge/-Support%20the%20Original%20Author-f1f1f1?style=for-the-badge&logo=kofi" alt="Support" />
  </a>
  <br/><br/>
  <img src="https://github.com/manuel-rw/jellyfin-discord-music-bot/actions/workflows/docker.yml/badge.svg?branch=master" />
  <img src="https://img.shields.io/badge/Docker-Ready-blue?style=flat-square" />
  <img src="https://img.shields.io/badge/Fuse.js-Enhanced%20Search-yellowgreen?style=flat-square" />
</p>
[![GHCR Image](https://ghcr-badge.egpl.dev/davidpk18/jellyfin-discord-music-bot-modified/latest_tag?label=GHCR%20Image&color=blue)](https://github.com/davidpk18/jellyfin-discord-music-bot/pkgs/container/jellyfin-discord-music-bot-modified)

---

## ✨ Features Overview — Improvements in This Fork

| Feature | Description |
|----------|-------------|
| 🔍 **Search System** | Fuse.js fuzzy search with album/artist weighting, typo-tolerance, and smart ranking |
| 💽 **Album Handling** | Automatically fetches full tracklists when an album is detected |
| 🧠 **Multi-Word Queries** | Multi-term fallback intelligently splits phrases and merges results |
| ⚡ **Caching** | In-memory album cache for instant repeated lookups |
| 🧾 **Logging** | Detailed debug output with Fuse scores and ranked previews |
| 🐳 **Docker Support** | Verified on Ubuntu 24.04 for both Docker and Compose setups |
| 🎶 **New Command** | `/browse` — a jukebox-style Discord UI for navigating Jellyfin music |
| 🧩 **Environment Variables** | Requires `GUILD_ID=` for faster guild command registration |
| ⚠️ **Kubernetes Method** | “Method 3 (K8S)” currently **untested** |

---

## 📚 Setup & Installation

This fork follows the same installation structure as the original project by **[Manuel-RW](https://github.com/manuel-rw/jellyfin-discord-music-bot/wiki)**.  
Please refer to his excellent wiki for detailed setup guidance:

- 🧠 [Initial Discord Bot Creation Guide](https://github.com/manuel-rw/jellyfin-discord-music-bot/wiki/%F0%9F%9A%80-Initial-Discord-Bot-Creation-Guide)
- ⚙️ [Installation Methods](https://github.com/manuel-rw/jellyfin-discord-music-bot/wiki/%F0%9F%9A%80-Installation)

---

### 🐳 **Method 1 — Docker Run**

```bash
docker run -d   -p 3000:3000   -e DISCORD_CLIENT_TOKEN='YOUR_DISCORD_BOT_TOKEN'   -e GUILD_ID='YOUR_GUILD_ID'   -e JELLYFIN_SERVER_ADDRESS='http://your.jellyfin.ip:8096'   -e JELLYFIN_AUTHENTICATION_USERNAME='username'   -e JELLYFIN_AUTHENTICATION_PASSWORD='password'   ghcr.io/davidpk18/jellyfin-discord-music-bot-modified:latest
```

---

### 🧩 **Method 2 — Docker Compose**

```yaml
version: '3.3'
services:
  jellyfin-discord-bot:
    image: ghcr.io/davidpk18/jellyfin-discord-music-bot-modified:latest
    container_name: jellyfin-discord-bot
    ports:
      - "3000:3000"
    environment:
      - DISCORD_CLIENT_TOKEN=YOUR_DISCORD_BOT_TOKEN
      - GUILD_ID=YOUR_GUILD_ID
      - JELLYFIN_SERVER_ADDRESS=http://your.jellyfin.ip:8096
      - JELLYFIN_AUTHENTICATION_USERNAME=username
      - JELLYFIN_AUTHENTICATION_PASSWORD=password
    restart: unless-stopped
```

---

### 💻 **Method 4 — Run From Source**

```bash
git clone https://github.com/davidpk18/jellyfin-discord-music-bot.git
cd jellyfin-discord-music-bot
```

Then follow the rest of the [original instructions here](https://github.com/manuel-rw/jellyfin-discord-music-bot/wiki/%F0%9F%9A%80-Installation#method-4-run-from-source).

> ⚠️ **Don’t forget:**  
> Add `GUILD_ID=` to your `.env` file — it’s now required for faster guild registration.

---

### 🧾 **Environment Variables**

Below is a reference for all required variables (used in both Docker and source setups):

```env
DISCORD_CLIENT_TOKEN=
GUILD_ID=

JELLYFIN_SERVER_ADDRESS=
JELLYFIN_AUTHENTICATION_USERNAME=
JELLYFIN_AUTHENTICATION_PASSWORD=
```

---

## ❤️ Credits

- 🧑‍💻 [Manuel-RW](https://github.com/manuel-rw/jellyfin-discord-music-bot) — original creator  
- 🧩 [KGT1](https://github.com/KGT1/jellyfin-discord-music-bot) — project inspiration  
- 📚 [NestJS](https://docs.nestjs.com/), [Discord.js](https://discord.js.org/), [Fuse.js](https://fusejs.io/), [Jellyfin SDK TS](https://github.com/jellyfin/jellyfin-sdk-typescript)

---

<p align="center">
  <em>“Listen together, self-hosted forever.” 🎧</em>
</p>

