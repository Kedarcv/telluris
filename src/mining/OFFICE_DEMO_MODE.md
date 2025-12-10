# Office Demo Mode - Active Navigation

## Changes Applied

The AI has been reconfigured from a "Mining Supervisor" to an "Office Navigator".

### 1. Active Navigation Prompts
**File:** `/src/mining/services/vision-integration-service.ts`

Changed the AI's instructions to:
- **Stop describing** the scene verbosely.
- **Start driving** immediately.
- **Focus on Action:** "FORWARD", "STOP", "LEFT", "RIGHT".
- **Identify Office Obstacles:** Chairs, tables, walls, people.

### 2. Office Locations Added
**File:** `/src/contexts/MiningVehicleContext.tsx`

The AI now knows these locations:
- **Kitchen** (100, 50)
- **Meeting Room** (-50, 100)
- **Reception** (0, 0)
- **Desk Area** (200, -50)
- **Hallway** (150, 100)
- **Server Room** (-100, -50)

## How to Run the Demo

1. **Start System:** `npm run dev-arduino`
2. **Enable Mining Mode:** Click the button.
3. **Give Commands:**
   - "Go to the Kitchen"
   - "Navigate to the Meeting Room"
   - "Patrol the Hallway"

## Expected Behavior

**User:** "Go to the Kitchen"

**AI (Old):** "I see a room with a desk and a chair. It looks like an office. The path seems clear." (No movement)

**AI (New):** "Moving to Kitchen. Path clear. FORWARD." (Vehicle moves)

**Obstacle Encounter:**
**AI:** "Chair detected ahead. Turning LEFT to avoid." (Vehicle turns)

## Tips for Demo
- **Speak clearly** when giving commands.
- **Place obstacles** (chairs/boxes) in the path to show avoidance.
- **Watch the console** to see the AI's "Thought Process" vs "Action".
