# Implementation Plan — Tangier City: Mesnana Golf (v1.3.0 Overhaul)

## 1. Executive Summary & Aesthetic Direction
We are overhauling and rebranding the open-world 3D driving and action experience into **Tangier City: Mesnana Golf** (`v1.3.0`), replacing the broken grid and harsh pink theme with an authentic representation of southwestern **Tangier, Morocco (Mesnana Golf, Royal Country Club de Tanger, Route de Boubana, Route de Rahrah, Socco Alto, and Hay El Kawassim)** and the **Official Tangier Mediterranean Sea Blue** aesthetic.

### Official Tangier Sea Blue Color System
- **Primary Canvas & Night/Dusk Surfaces**: Deep Strait of Gibraltar Navy (`#061526` to `#0b2239`) with crisp high-contrast panels (`rgba(8, 26, 46, 0.94)`).
- **Primary Brand Accent (Tangier Sea Blue)**: Official Tangier Mediterranean Azure (`#0077b6` / `#00a8e8`) and Strait Cyan (`#38bdf8`) for primary actions, active route lines, and focus rings.
- **Secondary Architectural & Heritage Accents**: Tangier Kasbah Whitewash (`#f8fafc`), Moroccan Sun Gold (`#f59e0b`) for mission waypoints/objectives, and Royal Golf Emerald (`#10b981`) for fairways and park zones.
- **Typography & TV Legibility**:
  - Replace all tiny `8px`–`10px` labels with a responsive **Text Size Scale Setting** (`Normal 100%`, `Large 120% (Default for TV)`, `Extra Large 140%`) applied globally via CSS custom root scaling and explicit readable type hierarchy (`16px`–`20px` body/controls, `24px`–`42px` section headers, `tabular-nums` for telemetry).

---

## 2. Authentic "Tangier – Mesnana Golf & Kawassim" Connected Road Network & World Map
Instead of disconnected overlapping planes, the entire city will be driven by a **Unified Road Graph & District Blueprint** modeled directly on the real geography of **Tangier – Mesnana Golf and its surrounding neighborhoods**:

### A. Real-World Districts & Connected Street Layout
1. **Royal Golf de Tanger (Central-North & East Green Belt)**:
   - Lush undulating golf fairways, sand bunkers, putting greens with flags, stone perimeter walls, eucalyptus/pine tree lines, and the Royal Golf Clubhouse entrance off Route de Boubana.
2. **Mesnana Central & Mesnana Golf Roundabout (Central / West Hub)**:
   - The main **Rond-Point Mesnana Golf** connecting Avenue Mesnana, Route de Rahrah, and the Golf Gardens residential complex (modern 4–6 story Tangier white-and-blue apartment blocks, cafes, and pharmacies).
3. **Hay El Kawassim (South-West & Southern Residential Sector)**:
   - Connected neighborhood streets looping south-west from Mesnana toward Rahrah, featuring Kawassim residential townhouses, neighborhood mosque tower landmark, local plazas, and connector avenues with continuous curbs and intersections.
4. **Route de Boubana & Socco Alto Plaza (North-East / Diplomatic & Commercial Corridor)**:
   - Winding tree-lined Boulevard de Boubana with hillside Mediterranean villas, leading to the **Socco Alto** commercial plaza roundabouts and parking forecourt.
5. **Route de Rahrah & Rahrah Urban Forest / Stadium Connector (South-East & Southern Arterial)**:
   - Continuous scenic avenue skirting the southern edge of the golf course and Kawassim, bordered by Rahrah pine woods and connecting to the southwestern sports complex boulevard.

### B. Seamless 3D Road & Intersection Engineering
- **Continuous Road Geometry**: Every road segment connects node-to-node at **Roundabouts (Rond-Points)** and **3-way / 4-way Intersections** with proper asphalt junctions, curved sidewalks, crosswalk stripes, center dashed lane markings, and streetlamp placement strictly along sidewalks (never inside driving lanes).
- **Building Footprint Alignment**: Every building, villa, golf wall, and plaza block is positioned inside valid city parcels set back from road edges and roundabouts, eliminating any buildings clipping into streets or cutting off routes.
- **High-Resolution Satellite/Vector Map Texture**: A dedicated procedural cartographic renderer (`mapRenderer.ts`) builds a high-resolution Tangier – Mesnana Golf & Kawassim cartographic map (showing fairways, water hazards, named avenues, roundabouts, building footprints, district names, mission pins, and live GPS route path) used by both the **Full-Screen World Map** and the **Top Rotating Mini-Map**.

---

## 3. Top Navigation Compass Arrow & Rotating Route Mini-Map
- **Top-Center Directional Compass Bar**:
  - Displays a prominent, high-visibility **3D-styled Navigation Arrow** pointing directly toward the active mission target, accompanied by the **target street/district name** (e.g., *Route de Rahrah · Kawassim East*) and live **distance in meters** (`tabular-nums`).
- **Top-Left Rotating Road Mini-Map**:
  - Renders the connected Mesnana Golf & Kawassim road network rotating smoothly with the player's heading.
  - Draws a glowing **Tangier Sea Blue / Gold GPS Route Line** calculated along the connected road graph from the player's current position to the active mission waypoint, plus a perimeter directional chevron if the waypoint is outside the immediate radar radius.

---

## 4. Unified Command Hub (World Map, Missions, & Settings Tabs)
Accessible anytime via the **Menu / Pause button (`Escape`, `M`, `Tab`, or Controller `Start`)** or direct hotkeys (`M` for Map, `J` for Missions, `O` for Settings), designed with large, crystal-clear TV typography and full D-Pad / Stick / Keyboard / Mouse navigation:

1. **World Map Tab (`MapScreen`)**:
   - Interactive full-screen cartographic view of **Tangier – Mesnana Golf & Kawassim**.
   - Zoom, pan, and inspect all named streets, roundabouts, landmarks (Royal Golf Club, Rond-Point Mesnana, Hay El Kawassim, Route de Boubana, Route de Rahrah, Socco Alto), active vehicles, and mission markers.
   - Click or press `A / Enter` on any landmark or road intersection to set a **Custom GPS Waypoint** or fast-inspect a mission route.
2. **Missions Tab (`MissionsScreen`)**:
   - Dedicated mission command board displaying **Available Story & Street Contracts**, **Active Mission Briefing**, **Step-by-Step Objectives**, **District Location**, **Cash Payout**, and **Replayable Completed Missions**.
   - Players can **Accept**, **Switch Active Tracked Objective**, **Set GPS Route**, or **Restart** missions directly from this screen, with Tangier-authentic missions (e.g., *Mesnana Golf VIP Escort*, *Kawassim Courier Run*, *Boubana Hill Time Trial*, *Socco Alto Night Delivery*, *Rahrah Forest Circuit*).
3. **Settings & Controls Tab (`SettingsModal`)**:
   - **Display & Accessibility**:
     - **Text Size Scale**: `Normal (100%)` · `Large TV (120%)` · `Extra Large (140%)` (persisted in `localStorage` and applied immediately across all menus and HUD).
     - **HUD Opacity & Mini-Map Zoom** controls.
   - **Audio & Camera**:
     - Master Volume, SFX Volume, Camera Follow Distance, and Invert Look toggles.
   - **Complete Context-Tabbed Button & Key Mapping**:
     - Organized into **3 clear Sub-Tabs** so every action is mappable for both **Controller Buttons** and **Keyboard Keys** without conflict:
       1. **In Car (Driving)**: Accelerate, Brake / Reverse, Steer Left, Steer Right, Handbrake / Drift, Nitro Boost, Exit Vehicle, Horn / Siren, Switch Camera View, Look Behind.
       2. **On Foot (Without Car)**: Move Forward, Move Backward, Strafe Left, Strafe Right, Sprint / Run, Enter Nearest Car, Action / Interact (Talk / Collect), Cycle Camera.
       3. **Menus & System UI**: Open World Map, Open Missions Screen, Pause / Command Hub, Confirm / Select, Back / Cancel, Next Tab (`RB`), Previous Tab (`LB`).
     - Interactive "Press any controller button or keyboard key to bind..." capture modal with conflict warnings and one-click **Reset Current Sub-Tab to Defaults**.

---

## 5. Additional Bug Fixes & Gameplay Improvements Included
- **Vehicle Physics & Curb/Roundabout Handling**: Smooth steering damping, improved drift/handbrake physics, and forgiving curb collision response so cars glide smoothly around Tangier roundabouts instead of snagging on box corners.
- **Smart AI Traffic on Connected Graph**: AI vehicles follow the connected Mesnana–Kawassim–Boubana–Rahrah road graph and yield at roundabouts instead of driving through buildings or vanishing at dead ends.
- **Clear On-Screen Prompts**: Context-sensitive prompt banner (e.g., *"Press [Y / E] to Enter Coupe"* or *"Press [X / Space] to Start Kawassim Delivery"*) using the player's actual custom-mapped button/key label and scaled according to the selected Text Size.

---

## 6. File-by-File Execution Plan (Upon Approval)
1. `/code_source/src/game/types.ts`: Define unified Road Graph types (nodes, roundabouts, connected street segments, districts), expanded Mission definitions, Text Size scale enum, and split `ControlBindings` (`inCar`, `onFoot`, `menuUi`) for both Gamepad and Keyboard.
2. `/code_source/src/game/tangierMapData.ts`: Define the authentic **Tangier – Mesnana Golf & Kawassim** road network, roundabouts, landmarks, building parcels, and GPS shortest-path route solver (Dijkstra/A* on road nodes).
3. `/code_source/src/game/mapRenderer.ts`: Procedural 2D cartographic map & mini-map renderer drawing fairways, connected roads, roundabouts, street names, GPS route path, and directional indicators.
4. `/code_source/src/game/world3d.ts` & `/code_source/src/game/rules.ts`: Rebuild 3D road geometry, roundabout plazas, golf course terrain/fairways, Tangier white/blue residential blocks, villas, and AI traffic pathing to match `tangierMapData.ts` 1:1.
5. `/code_source/src/components/CommandHubModal.tsx`: Unified Command Hub hosting the **World Map Screen**, **Missions Screen**, and **Settings & Context-Tabbed Controls Screen** with Tangier Sea Blue theme and scalable TV typography.
6. `/code_source/src/components/GameHud.tsx` & `/code_source/src/components/TitleScreen.tsx`: Rebrand to *Tangier City: Mesnana Golf*, add Top Compass Arrow + Rotating Route Mini-Map, apply Tangier Sea Blue palette, and wire Text Size scaling.
7. Build & Sync Production Bundle (`npm run build` in `/code_source/` and write updated `/index.html`, `/mypc-app.json`, and `/assets/*` to root `/` for GitHub Pages).
