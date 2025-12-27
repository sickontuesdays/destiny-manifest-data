# Destiny 2 Manifest Data

This repository contains the optimized Destiny 2 manifest data for the Sick on Tuesdays dashboard and Build Crafter system.

## Data Overview

**Total Size:** ~264 MB
**Files:** 18 optimized JSON files
**Updated:** Weekly (Tuesdays at 1PM ET with new Destiny releases)

## Chunked Data Files

### Large Item Chunks (Lazy-loaded)
- **weapons.json** (79.9 MB) - All weapons and weapon data
- **armor.json** (87.2 MB) - All armor pieces and stats
- **consumables.json** (16.7 MB) - Mods, materials, consumables
- **cosmetics.json** (28.2 MB) - Shaders, emblems, ornaments
- **uncategorized.json** (41.1 MB) - Other items not in main categories

### Definition Files (Fast-loading)
- **DestinyStatDefinition.json** (39.5 KB) - Stat definitions (76 stats)
- **DestinyTraitDefinition.json** (158 KB) - Trait definitions (458 traits)
- **DestinyDamageTypeDefinition.json** (4 KB) - Damage type definitions
- **DestinyClassDefinition.json** (1.3 KB) - Guardian class definitions
- **DestinySandboxPerkDefinition.json** (3.3 MB) - Perk definitions (4,744 perks)
- **DestinyPlugSetDefinition.json** (11.9 MB) - Plug set definitions (4,476 sets)
- **DestinySocketTypeDefinition.json** (1.3 MB) - Socket type definitions (1,253 sockets)
- **DestinyItemCategoryDefinition.json** (88 KB) - Item category definitions
- **DestinyActivityModifierDefinition.json** (303 KB) - Activity modifier definitions
- **DestinySeasonDefinition.json** (47.5 KB) - Season definitions
- **DestinyBreakerTypeDefinition.json** (1.4 KB) - Champion breaker types
- **DestinyEnergyTypeDefinition.json** (2.7 KB) - Energy type definitions

### Metadata
- **optimization-metadata.json** (1.6 KB) - Optimization statistics and info

## Usage

This data is accessed via GitHub's raw file CDN:
```
https://raw.githubusercontent.com/YOUR_USERNAME/destiny-manifest-data/main/FILENAME.json
```

## Optimization Details

- Converted from SQLite to JSON for web compatibility
- Chunked by item category for efficient lazy loading
- Load time reduced from 60+ seconds to ~5 seconds per chunk
- Supports progressive loading (Essential → Analysis → Item chunks)

## Source

Original data from Bungie's Destiny 2 manifest, converted using the optimized manifest converter in the main Sick on Tuesdays project.

## License

Data belongs to Bungie. This repository contains processed versions for web application use.

trying new push, needed a change.