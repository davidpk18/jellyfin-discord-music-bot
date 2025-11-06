<p align="center">
  <a href="https://nestjs.com/" target="blank"><img src="https://github.com/walkxcode/dashboard-icons/blob/main/png/jellyfin.png?raw=true" width="200" alt="Jellyfin Logo" /></a>
</p>

<h1 align="center">Jellyfin Discord Music Bot — redux 🎶</h1>

<p align="center">
  A fork of <a href="https://github.com/manuel-rw/jellyfin-discord-music-bot" target="_blank">Manuel-RW’s Jellyfin Discord Music Bot</a>, with a new /browse command, and somewhat streamlined search. A massive thank you to him for the repo.
</p>

<p align="center">
  <a href="https://github.com/manuel-rw/jellyfin-discord-music-bot/wiki/%F0%9F%9A%80-Installation"><img src="https://img.shields.io/badge/-Installation%20Guide-7289da?style=for-the-badge&logo=markdown" alt="Installation Badge" /></a>
  <a href="https://discord.gg/hRHZ3q3VDX"><img src="https://img.shields.io/badge/-Community%20Discord-7289da?style=for-the-badge&logo=discord" alt="Community Discord" /></a>
  <a href='https://ko-fi.com/A0A42YZ7W' target='_blank'><img src="https://img.shields.io/badge/-Support%20the%20Original%20Author-f1f1f1?style=for-the-badge&logo=kofi" alt="Support" /></a>
  <br/><br/>
  <img src="https://github.com/manuel-rw/jellyfin-discord-music-bot/actions/workflows/docker.yml/badge.svg?branch=master" />
  <img src="https://img.shields.io/badge/Docker-Ready-blue?style=flat-square" />
  <img src="https://img.shields.io/badge/Fuse.js-Enhanced%20Search-yellowgreen?style=flat-square" />
</p>

---

## ✨ Features Overview — Improvements in This Fork

| Category | Fork|
|-----------|---------------|------------------------------|
| **Search System** | 🔍 **Fuse.js fuzzy search** with album/artist weighting, typo-tolerance, and smart ranking |
| **Album Handling** | 💽 **Album-aware search** — automatically fetches full tracklists once an album is detected |
| **Multi-Word Queries** | 🧠 **Multi-term fallback** — intelligently splits phrases and merges results |
| **Caching** | ⚡ **In-memory album cache** for rapid repeated lookups |
| **Logging & Debugging** | 🧾 **Detailed debug output** with Fuse scores and ranked result previews |
| **Docker Support** | 🐳 **Confirmed compatible with Docker / Compose builds** on Ubuntu 24.04 |
| **New Command** | 🎶 **`/browse` command** — jukebox-style Discord UI for browsing and playing Jellyfin music |
| **Environment Variables** | 🧩 **Requires `GUILD_ID=`** for faster guild command registration |
| **Kubernetes Method** | ⚠️ **Method 3 (K8S)** currently **untested** in this fork |

---

## 📚 Setup & Installation

The [Jellyfin Discord Music Bot](https://github.com/manuel-rw/jellyfin-discord-music-bot/wiki) by **Manuel-RW** covers the installation process. Should be largely the same,

For full setup instructions, please refer to the original Wiki guides:

- 🧠 **[Initial Discord Bot Creation Guide](https://github.com/manuel-rw/jellyfin-discord-music-bot/wiki/%F0%9F%9A%80-Initial-Discord-Bot-Creation-Guide)**
- ⚙️ **[Installation Methods](https://github.com/manuel-rw/jellyfin-discord-music-bot/wiki/%F0%9F%9A%80-Installation)**
  - **Method 1: Docker Run**
   <pre> ``` docker run \
-p 3000:3000 \
-e DISCORD_CLIENT_TOKEN='' \
-e JELLYFIN_SERVER_ADDRESS='' \
-e JELLYFIN_AUTHENTICATION_USERNAME='' \
-e JELLYFIN_AUTHENTICATION_PASSWORD='' \
ghcr.io/davidpk18/jellyfin-discord-music-bot-modified:latest ``` <pre>

  - **Method 2: Docker Compose**
    <pre>``` version: '3.3'
services:
  manuel-rw:
    ports:
      - '3000:3000'
    environment:
      - DISCORD_CLIENT_TOKEN=
      - GUILD_ID=
      - JELLYFIN_SERVER_ADDRESS=
      - JELLYFIN_AUTHENTICATION_USERNAME=
      - JELLYFIN_AUTHENTICATION_PASSWORD=
    image: 'ghcr.io/davidpk18/jellyfin-discord-music-bot-modified:latest' ``` </pre>
    
  - **Method 4: Run From Source**
    git clone https://github.com/davidpk18/jellyfin-discord-music-bot.git
    cd jellyfin-discord-music-bot/
FOLLOW REST OF INSTRUCTIONS **[HERE](https://github.com/manuel-rw/jellyfin-discord-music-bot/wiki/%F0%9F%9A%80-Installation#method-4-run-from-source), DON'T FORGET GUILD_ID=
---
