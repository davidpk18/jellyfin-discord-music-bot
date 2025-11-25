<p align="center">
  <a href="https://jellyfin.org/" target="_blank">
    <img src="https://github.com/walkxcode/dashboard-icons/blob/main/png/jellyfin.png?raw=true" width="200" alt="Jellyfin Logo" />
  </a>
</p>

<h1 align="center">Jellyfin Discord Music Bot — Redux 🎶</h1>

<p align="center">
  A fork of <a href="https://github.com/manuel-rw/jellyfin-discord-music-bot" target="_blank">Manuel-RW’s Jellyfin Discord Music Bot</a>, with a new <code>/browse</code> command, more robust search system, and persistent volume!
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
  <a href='https://buymeacoffee.com/davejone' target='_blank'>
    <img src="https://img.shields.io/badge/-I%20LOVE%20COFFEE-f1f1f1?style=for-the-badge&logo=buymeacoffee" alt="Support" />
  </a>
  <br/><br/>

</p>


---

## ✨ Features Overview — Improvements in This Fork

| Feature | Description |
|----------|-------------|
| 🔍 **Search System** | Native Jellyfin search + 'Artist Album' fallback |
| 💽 **Album Handling** | Plays albums in order with tracklisting + multi disc support |
| 🐳 **Docker Support** | Verified on Ubuntu 24.04 for both Docker and Compose setups |
| 🎶 **New Command** | `/browse` — a jukebox-style Discord UI for navigating Jellyfin music |
| 🧩 **Environment Variables** | Requires `GUILD_ID=` for faster guild command registration |

---

## 🎬 Feature Showcase

<p align="center">
  <a href="https://github.com/davidpk18/jellyfin-discord-music-bot/blob/main/images/slashbrowse.gif">
    <img src="https://github.com/davidpk18/jellyfin-discord-music-bot/blob/main/images/slashbrowse.gif" 
         alt="/browse command demo" width="48%" style="border-radius:10px; margin-right: 1%;" />
  </a>
  <a href="https://github.com/davidpk18/jellyfin-discord-music-bot/blob/dev/images/slashplay.gif">
    <img src="https://github.com/davidpk18/jellyfin-discord-music-bot/blob/dev/images/slashplay.gif" 
         alt="/play command demo" width="48%" style="border-radius:10px; margin-left: 1%;" />
  </a>
</p>

<p align="center">
  <em>Left: the new <strong>/browse</strong> jukebox UI • Right: enhanced <strong>/play</strong> search experience</em>
</p>

---

## 📚 Setup & Installation
### DOCKER IMAGE: ghcr.io/davidpk18/jellyfin-discord-music-bot:latest
Besides the Docker image itself, this fork mostly follows the same installation structure as the original project by **[Manuel-RW](https://github.com/manuel-rw/jellyfin-discord-music-bot/wiki)**.  
Please refer to his excellent wiki for detailed setup guidance:

- 🧠 [Initial Discord Bot Creation Guide](https://github.com/manuel-rw/jellyfin-discord-music-bot/wiki/%F0%9F%9A%80-Initial-Discord-Bot-Creation-Guide)
- ⚙️ [Installation Methods](https://github.com/manuel-rw/jellyfin-discord-music-bot/wiki/%F0%9F%9A%80-Installation)

---

### 🐳 **Method 1 — Docker Run**

```bash
docker run -d   -p 3000:3000   -v ./config:/app/config   -e DISCORD_CLIENT_TOKEN='YOUR_DISCORD_BOT_TOKEN'   -e GUILD_ID='YOUR_GUILD_ID'   -e JELLYFIN_SERVER_ADDRESS='http://your.jellyfin.ip:8096'   -e JELLYFIN_AUTHENTICATION_USERNAME='username'   -e JELLYFIN_AUTHENTICATION_PASSWORD='password'   ghcr.io/davidpk18/jellyfin-discord-music-bot:latest
```

---

### 🧩 **Method 2 — Docker Compose**

```yaml
services:
  jellyfin-discord-bot:
    image: ghcr.io/davidpk18/jellyfin-discord-music-bot:latest
    container_name: jellyfin-discord-bot
    volumes:
      - ./config:/app/config
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

