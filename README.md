# VOID CHANNEL — Setup

A curated weird-media browser for the Internet Archive.
Backend (Node) + Mobile app (React Native / Expo).

---

## 1. Install prerequisites (one-time)

You need **Node.js 18+** on your machine.
Download from <https://nodejs.org/> and install — pick the LTS version.

To check:
```powershell
node --version
npm --version
```
If both print a version, you're good.

You also need the **Expo Go** app on your phone (App Store / Play Store) — that's how you'll actually run the app without setting up Xcode or Android Studio.

---

## 2. Extract the project

Unzip `void-channel-v2.zip` somewhere easy to find, e.g. `C:\Users\bryan\void-channel\`.

Inside you'll see two folders:
```
void-channel/
├── backend/   ← the caching proxy
└── mobile/    ← the React Native app
```

---

## 3. Start the backend (Terminal 1)

Open PowerShell and:
```powershell
cd C:\Users\bryan\void-channel\backend
npm install
npm run dev
```

You should see:
```
⚡ VOID CHANNEL PROXY
→ http://localhost:3001
→ Cache TTL: categories=1h, items=6h, search=30m
```

Leave this terminal running. The mobile app talks to it.

**Quick check:** visit <http://localhost:3001/health> in your browser — should show `{"status":"ok"}`.

---

## 4. Start the mobile app (Terminal 2 — new window)

Open a **second** PowerShell window:
```powershell
cd C:\Users\bryan\void-channel\mobile
npm install
npx expo start
```

`npm install` takes 2-3 minutes the first time. After it finishes, `npx expo start` will print a QR code in the terminal.

---

## 5. Open the app on your phone

**On iPhone:** open the Camera app, point it at the QR code, tap the Expo notification.

**On Android:** open the **Expo Go** app, tap "Scan QR code", point at the terminal.

Your phone needs to be on **the same Wi-Fi network** as your computer.

---

## 6. Connecting phone to backend

By default the mobile app expects the backend at `http://localhost:3001`. That works in a simulator on the same machine, but **not from a phone** — `localhost` on the phone means the phone itself.

If you're testing on a real phone, you need to point it at your computer's local IP.

**Find your computer's IP** in PowerShell:
```powershell
ipconfig | findstr IPv4
```
You'll see something like `192.168.1.42`.

Edit `mobile\src\api\client.js`, line 7:
```js
const BASE_URL = __DEV__
  ? "http://192.168.1.42:3001"   // ← your IP here
  : "https://your-proxy.example.com";
```

Save the file. Expo auto-reloads.

---

## What you should see

1. App opens on the **Browse** tab — animated equalizer wave avatar is on the **Signal** tab (4th tab)
2. Hero card at the top with a featured weird film
3. Eight category rows below ("They Made You Watch This", "Cartoons That Haunted Children", etc.)
4. Tap any card → video plays natively. A small `+10 XP` toast appears top-right
5. Tap the **Signal** tab → see your rank, daily bounties, generation switcher
6. Tap **Boomer / Millennial / Gen Z** → category names and accent color flip across the whole app instantly

---

## Common issues

| Problem | Fix |
|---------|-----|
| `npm install` fails on `node-gyp` / Python errors | You have Node 20+ which doesn't need it. If it persists, run `npm install --legacy-peer-deps` |
| `Network request failed` in app | Phone can't reach backend — see step 6 (use your computer's IP, not localhost) |
| Categories show "DEAD AIR ON THIS CHANNEL" | Backend isn't reachable — check Terminal 1 is still running |
| Videos load but don't play | Some Archive items don't have an MP4 derivative; the player will say "No video stream available" — try another item |
| Expo Go can't load the bundle | Make sure both devices are on the same Wi-Fi; turn off VPN if you have one |
| Port 3001 already in use | Kill whatever's on it, or change `PORT` in `backend/server.js` |

---

## Tearing it down

Press `Ctrl+C` in each terminal. Local watch history / XP / saved items live in your phone's AsyncStorage and persist across restarts.
