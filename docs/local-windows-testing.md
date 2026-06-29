# Local Windows Testing Guide

## Prerequisites

1. Windows 10 or Windows 11.
2. Node.js 18 or newer installed from <https://nodejs.org/>.
3. Git for Windows installed from <https://git-scm.com/download/win>.
4. A modern desktop browser for laptop testing: Edge, Chrome, or Firefox.
5. Optional for TV testing: your VIDAA TV and both the laptop and TV on the same network.

No npm dependencies are currently required because the MVP uses only built-in Node.js modules and static browser JavaScript.

## Step-by-step local test

Open PowerShell in the folder where you keep projects and run:

```powershell
git clone <YOUR_REPO_URL> vidaamovieshub
cd vidaamovieshub
npm run check
npm test
npm start
```

Open this on the laptop:

```text
http://localhost:4173
```

Use keyboard keys as the TV remote stand-in:

```text
Arrow keys = move focus
Enter = OK/select
Escape or Backspace = Back
Enter in player = Play/Pause
Left/Right in player = seek
Up in player = try next source
```

## Test from your VIDAA TV browser on the same Wi-Fi

1. On Windows, find your laptop IP address:

```powershell
ipconfig
```

2. Look for the IPv4 address, for example:

```text
192.168.1.25
```

3. Start the app so it listens on all interfaces:

```powershell
$env:HOST="0.0.0.0"; npm start
```

4. On your TV browser, open:

```text
http://YOUR_LAPTOP_IP:4173
```

Example:

```text
http://192.168.1.25:4173
```

5. If the TV cannot connect, allow Node.js through Windows Defender Firewall for Private networks.

## What to test manually

- Home loads with poster rows.
- Focus moves with remote or keyboard arrows.
- Search opens and returns demo content.
- Live TV opens and shows the demo live channel.
- Details page opens from a card.
- Favorite can be toggled and appears in Favorites.
- Player opens from Play.
- Back returns to Details/Home.
- Settings shows resolution, HLS, MediaSource, and local storage capability.
