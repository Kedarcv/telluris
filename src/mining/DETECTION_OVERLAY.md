# Detection Overlay - Visual Bounding Boxes

## Feature Added

Added real-time visual bounding boxes on the camera feed to show what objects the AI is detecting.

## What It Does

When you're in **Mining Mode**, the camera feed will now display:
- **Colored bounding boxes** around detected objects
- **Labels** showing the object class and confidence percentage
- **Center points** marking the center of each detection

## Color Coding

| Object Type | Box Color | Meaning |
|-------------|-----------|---------|
| **Person** | 🔴 Red | Critical - highest priority |
| **Truck** | 🟠 Orange | High priority vehicle |
| **Equipment** | 🟡 Yellow | Medium priority |
| **Other** | 🟢 Green | Low priority |

## How It Works

### Architecture

```
Camera Feed → Video Processing → YOLO/Perception Service
                                         ↓
                                   Detections Array
                                         ↓
                    MiningControl → App.tsx → DetectionOverlay
                                         ↓
                              Canvas draws boxes on video
```

### Components Created

1. **`DetectionOverlay.tsx`**
   - React component that renders a canvas overlay
   - Positioned absolutely on top of the video element
   - Draws bounding boxes, labels, and confidence scores
   - Updates in real-time as detections change

2. **`detection-overlay.scss`**
   - Styles the canvas to overlay the video
   - Transparent background with pointer-events disabled
   - Z-index ensures it's above the video

### Integration Points

1. **App.tsx**
   - Added `DetectionOverlay` component
   - Wrapped video in a relative-positioned div
   - Passes `videoRef`, `detections`, and `videoStream` to overlay

2. **MiningControl.tsx**
   - Added `onDetectionsChange` callback prop
   - Calls parent when detections update
   - Passes detections array up to App.tsx

## What You'll See

### Before (No Overlay)
```
📹 [Camera feed showing room]
```

### After (With Overlay)
```
📹 [Camera feed showing room]
    ┌─────────────────┐
    │ person 85%      │ ← Red box
    └─────────────────┘
    
         ┌──────────────────────┐
         │ equipment 72%        │ ← Yellow box
         └──────────────────────┘
```

## Display Format

Each detection shows:
```
┌─────────────────────┐
│ [class] [conf%]     │ ← Label with background
│                     │
│         •           │ ← Center point
│                     │
└─────────────────────┘
```

## When It's Active

✅ **Overlay shows when:**
- Mining Mode is enabled
- Camera/video stream is active
- Detections are being processed

❌ **Overlay hidden when:**
- In Altair Mode (not Mining Mode)
- No video stream
- No detections found

## Technical Details

### Canvas Rendering
- **Size matching**: Canvas automatically matches video dimensions
- **Frame rate**: Updates at ~60 FPS (requestAnimationFrame)
- **Transparency**: 90% opacity for visibility
- **No interaction**: Pointer events disabled (clicks pass through)

### Detection Data Flow
```typescript
// Detection object structure
{
  frame_id: string,
  ts: number,
  class: 'person' | 'truck' | 'equipment' | ...,
  bbox: { x, y, width, height },
  position: { x, y, z, frame },
  confidence: 0.0 - 1.0
}
```

### Performance
- Lightweight canvas drawing
- Only renders when detections change
- Clears and redraws each frame
- No performance impact on video playback

## Files Modified

1. **`/src/components/detection-overlay/DetectionOverlay.tsx`** [NEW]
   - Main overlay component
   - Canvas rendering logic
   - Bounding box drawing

2. **`/src/components/detection-overlay/detection-overlay.scss`** [NEW]
   - Overlay positioning styles
   - Canvas transparency

3. **`/src/App.tsx`**
   - Added DetectionOverlay import
   - Added detections state
   - Wrapped video in relative container
   - Rendered overlay conditionally

4. **`/src/components/mining-control/MiningControl.tsx`**
   - Added `onDetectionsChange` prop
   - Added useEffect to notify parent
   - Passes detections up to App

## Test It

```bash
npm run dev-arduino
```

**Steps:**
1. Click **⛏️ Mining Mode** button
2. Allow camera access
3. Camera feed appears
4. **Look for colored boxes** around detected objects!
5. Labels show object type and confidence

## Example Output

When the AI detects objects, you'll see:
- **Red box** around you (person detected)
- **Yellow boxes** around desk items (equipment)
- **Confidence scores** like "person 87%" or "equipment 65%"
- **Real-time updates** as you move or objects change

## Benefits

✅ **Visual feedback** - See exactly what the AI sees
✅ **Confidence levels** - Know how certain the AI is
✅ **Color coding** - Quickly identify priority levels
✅ **Real-time** - Updates as fast as detection runs
✅ **Non-intrusive** - Transparent overlay, doesn't block view

Now you can visually verify that the AI is detecting objects correctly! 🎯📦
