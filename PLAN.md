# Node-Graph Media Editor - Implementation Plan

## Current Status (Updated: 2026-01-27)

### Completed Phases
- [x] Phase 1: Foundation & Graph Core
- [x] Phase 2: Graph Editor UI
- [x] Phase 3: Basic Nodes
- [x] Phase 4: Node Palette & Properties
- [x] Phase 5: Transform & Filter Nodes
- [x] Phase 6: Compositing & Masks
- [x] Phase 7: AI Nodes (placeholder implementations)

### In Progress
- [ ] Phase 8: Project Files & History (partially done)
- [ ] Phase 9: Performance & Mobile

### How to Run
```bash
cd D:\devl\pe

# If node_modules doesn't exist, install dependencies:
D:\devl\pe\install.bat

# Start dev server:
D:\devl\pe\dev.bat

# Or with Node in PATH:
npm run dev
```

Access at: http://localhost:3000

### How to Use the App
1. **Add nodes** from the left panel (Node Palette)
2. **Connect nodes** by dragging from output port (right side of node) to input port (left side)
3. **Select a node** and use Properties panel (right) to configure parameters
4. **For Image Input**: Click "Select file..." to load an image
5. **Click Execute** button to run the graph
6. **Preview** appears in the right viewport

### Known Issues / Debug Notes
- Node ports: Drag from orange circle to orange circle to connect
- File input stores images as data URLs for state persistence
- Console logging enabled for debugging (see browser DevTools F12)
- Toast notifications show execution errors

### Files with Debug Logging (can remove later)
- `src/components/preview/PreviewViewport.tsx` - logs preview node detection
- `src/core/nodes/input/ImageInputNode.ts` - logs file loading
- `src/store/executionStore.ts` - logs execution callbacks
- `src/components/properties/ParameterInput.tsx` - logs file selection

---

## Overview
A data-driven, node-graph based media editing application supporting photos (and future video). Operations are represented as nodes in a visual graph, with data flowing through connections. Some nodes support AI-powered processing.

## Core Concepts

### Node Graph Architecture
```
┌─────────┐     ┌──────────┐     ┌─────────────┐     ┌────────┐
│  Input  │────▶│ Blur     │────▶│ AI Enhance  │────▶│ Output │
│  Image  │     │ Node     │     │ Node        │     │ Node   │
└─────────┘     └──────────┘     └─────────────┘     └────────┘
                    │
                    ▼
             ┌──────────┐
             │ Branch   │
             │ Output   │
             └──────────┘
```

- **Nodes**: Self-contained processing units with inputs and outputs
- **Ports**: Typed connection points (image, mask, number, color, etc.)
- **Edges**: Connections between compatible ports
- **Graph**: Collection of nodes and edges forming a processing pipeline

### Data Types (Port Types)
- `image` - RGBA image data (ImageData or ImageBitmap)
- `mask` - Single-channel grayscale data
- `number` - Numeric value (with min/max/step constraints)
- `color` - RGBA color value
- `boolean` - True/false toggle
- `string` - Text value
- `vector2` - 2D point/vector
- `rect` - Rectangle (x, y, width, height)
- `selection` - Selection data (mask + bounds)
- `videoFrame` - (Future) Video frame with timestamp

### Node Categories

#### Input Nodes
- **Image Input** - Load image from file
- **Color Input** - Solid color generator
- **Gradient Input** - Linear/radial gradient generator
- **Noise Generator** - Perlin/simplex noise
- **Video Input** - (Future) Load video file

#### Transform Nodes
- **Rotate** - Rotate image by angle
- **Scale** - Resize image
- **Flip** - Horizontal/vertical flip
- **Crop** - Crop to region
- **Translate** - Move/offset image

#### Adjustment Nodes
- **Brightness/Contrast** - Basic tonal adjustment
- **Hue/Saturation/Lightness** - HSL adjustment
- **Levels** - Input/output levels with gamma
- **Curves** - (Future) Tone curve adjustment
- **Invert** - Invert colors

#### Filter Nodes
- **Blur** - Gaussian blur
- **Sharpen** - Unsharp mask sharpening
- **Convolution** - Custom kernel convolution

#### Compositing Nodes
- **Blend** - Blend two images (with blend modes)
- **Layer** - Composite with opacity/mask
- **Merge** - Combine multiple inputs

#### Mask/Selection Nodes
- **Mask Input** - Load/create mask
- **Threshold** - Create mask from threshold
- **Mask Operations** - Invert, expand, contract, feather
- **Apply Mask** - Apply mask to image alpha

#### AI Nodes
- **AI Enhance** - Upscale/enhance using AI
- **AI Remove Background** - Background removal
- **AI Inpaint** - Fill selected region
- **AI Style Transfer** - Apply artistic style
- **AI Generate** - Text-to-image generation
- **Custom AI Node** - User-provided model endpoint

#### Output Nodes
- **Preview** - Display in viewport
- **Export Image** - Save as PNG/JPEG/WebP
- **Export Video** - (Future) Render video

#### Utility Nodes
- **Split Channels** - Split RGBA into separate outputs
- **Merge Channels** - Combine channels into image
- **Math** - Mathematical operations on numbers
- **Switch** - Conditional routing
- **Cache** - Cache result for performance

## Tech Stack

### Core
- **Framework**: React 18 + TypeScript
- **Build Tool**: Vite
- **State Management**: Zustand with Immer
- **Styling**: Tailwind CSS

### Node Graph
- **Graph Editor**: Custom implementation
- **Graph Execution**: Custom topological sort execution engine

### Rendering
- **Canvas**: OffscreenCanvas + Canvas 2D API
- **WebGL**: For performance-critical operations (optional)
- **Web Workers**: Background processing for heavy operations

### AI Integration
- **Local**: Transformers.js for client-side models
- **Remote**: REST API integration for external AI services
- **Configurable**: Node settings for API endpoints

### Future Video Support
- **WebCodecs API**: For video decode/encode
- **MediaStreamTrack**: For webcam input
- **Timeline**: Keyframe-based animation system

## Project Structure
```
pe/
├── index.html
├── package.json
├── vite.config.ts
├── tailwind.config.js
├── tsconfig.json
├── install.bat              # Install dependencies
├── dev.bat                  # Start dev server
├── PLAN.md                  # This file
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── index.css            # Tailwind + custom styles
│   │
│   ├── components/
│   │   ├── layout/
│   │   │   ├── AppLayout.tsx
│   │   │   ├── TopToolbar.tsx
│   │   │   └── index.ts
│   │   │
│   │   ├── graph/
│   │   │   ├── GraphCanvas.tsx
│   │   │   ├── GraphNode.tsx
│   │   │   ├── GraphPort.tsx
│   │   │   ├── GraphEdge.tsx
│   │   │   ├── NodePalette.tsx
│   │   │   └── index.ts
│   │   │
│   │   ├── preview/
│   │   │   ├── PreviewViewport.tsx
│   │   │   └── index.ts
│   │   │
│   │   ├── properties/
│   │   │   ├── PropertiesPanel.tsx
│   │   │   ├── ParameterInput.tsx
│   │   │   └── index.ts
│   │   │
│   │   └── ui/
│   │       ├── Button.tsx
│   │       ├── Slider.tsx
│   │       ├── ColorPicker.tsx
│   │       ├── Select.tsx
│   │       ├── Input.tsx
│   │       ├── Toggle.tsx
│   │       ├── ToastContainer.tsx
│   │       └── index.ts
│   │
│   ├── core/
│   │   ├── graph/
│   │   │   ├── GraphEngine.ts
│   │   │   ├── NodeRegistry.ts
│   │   │   ├── GraphValidator.ts
│   │   │   └── TopologicalSort.ts
│   │   │
│   │   └── nodes/
│   │       ├── index.ts
│   │       ├── defineNode.ts
│   │       ├── input/           # ImageInput, ColorInput, Noise
│   │       ├── output/          # Preview, Export
│   │       ├── adjust/          # BrightnessContrast, HueSaturation, Levels, Invert
│   │       ├── transform/       # Rotate, Flip, Scale, Crop
│   │       ├── filter/          # Blur, Sharpen, Convolution
│   │       ├── composite/       # Blend, Merge
│   │       ├── mask/            # Threshold, MaskOperations, ApplyMask
│   │       ├── ai/              # AIEnhance, AIRemoveBackground, AICustom
│   │       └── utility/         # SplitChannels, MergeChannels, Math
│   │
│   ├── store/
│   │   ├── index.ts
│   │   ├── graphStore.ts
│   │   ├── uiStore.ts
│   │   ├── executionStore.ts
│   │   └── historyStore.ts
│   │
│   ├── hooks/
│   │   ├── index.ts
│   │   ├── useGraph.ts
│   │   ├── useViewport.ts
│   │   └── useKeyboard.ts
│   │
│   └── types/
│       ├── index.ts
│       ├── data.ts
│       ├── node.ts
│       └── graph.ts
│
└── node_modules/
```

## Implementation Phases

### Phase 1: Foundation & Graph Core ✅
1. Project setup (Vite + React + TypeScript + Tailwind)
2. Type definitions for graph, nodes, data types
3. NodeRegistry - register and lookup node definitions
4. GraphEngine - graph validation and execution
5. Basic Zustand stores (graph, UI)

### Phase 2: Graph Editor UI ✅
1. GraphCanvas component with pan/zoom
2. GraphNode component (draggable, ports)
3. GraphPort component (connection points)
4. GraphEdge component (bezier curves)
5. Connection creation via drag from port to port
6. Node selection and deletion

### Phase 3: Basic Nodes ✅
1. ImageInputNode - load image file
2. PreviewNode - display output
3. ExportNode - save to file
4. Simple adjustments: BrightnessContrast, Invert
5. Wire up execution pipeline

### Phase 4: Node Palette & Properties ✅
1. NodePalette component - categorized node list
2. Click to add nodes
3. PropertiesPanel - show selected node parameters
4. Dynamic parameter inputs (sliders, color pickers)
5. Real-time preview updates

### Phase 5: Transform & Filter Nodes ✅
1. Rotate, Scale, Flip, Crop nodes
2. Blur, Sharpen, Convolution nodes
3. HueSaturation, Levels adjustment nodes

### Phase 6: Compositing & Masks ✅
1. BlendNode with blend modes
2. MergeNode for multiple inputs
3. Mask nodes (Threshold, operations)
4. Split/Merge channels

### Phase 7: AI Nodes ✅
1. AI provider abstraction layer (placeholder)
2. AIEnhanceNode (placeholder/API integration)
3. AIRemoveBackgroundNode
4. AICustomNode for user-configured endpoints
5. Loading states and error handling

### Phase 8: Project Files & History (In Progress)
1. [x] Graph serialization (save/load JSON) - basic implementation
2. [x] Undo/redo with graph state snapshots - historyStore exists
3. [ ] Auto-save to localStorage
4. [x] File operations (new, open, save) - in TopToolbar
5. [ ] Export to PNG/JPEG

### Phase 9: Performance & Mobile (Pending)
1. [ ] Web Worker pool for heavy processing
2. [ ] Caching of intermediate results
3. [x] Incremental graph execution (dirty nodes only)
4. [x] OffscreenCanvas for rendering
5. [ ] Responsive layout improvements
6. [ ] Touch gesture handling improvements

## Remaining Tasks

### High Priority
1. Fix any remaining image preview issues
2. Test full workflow: load image → adjust → preview
3. Implement proper image export functionality

### Medium Priority
1. Auto-save to localStorage
2. Better mobile/touch support
3. Web Workers for heavy image processing

### Low Priority
1. Remove debug console.log statements
2. Add more node types
3. Implement actual AI integrations
4. Video support (future)

## Debug Commands

Open browser DevTools (F12) and check Console for:
- `PreviewViewport - previewNodes:` - shows detected preview nodes
- `PreviewViewport - nodeOutputs:` - shows cached outputs
- `ImageInputNode execute - file:` - shows loaded file
- `ExecutionStore - onNodeComplete:` - shows completed nodes

## Keyboard Shortcuts
- `Ctrl+Z` - Undo
- `Ctrl+Y` or `Ctrl+Shift+Z` - Redo
- `Ctrl+C` - Copy selected nodes
- `Ctrl+V` - Paste nodes
- `Ctrl+X` - Cut selected nodes
- `Ctrl+A` - Select all
- `Delete` / `Backspace` - Delete selected
- `Escape` - Clear selection
