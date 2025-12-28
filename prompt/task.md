### **Project Overview**

```
Build a frontend-only low-code website builder (like Wix / Shopify) that allows users to drag-and-drop UI components into a grid-based canvas, configure styles, preview live output, and export a deployable static build where preview and final output are identical (WYSIWYG).
```

---

### **Tech Stack**

```
Framework   : React
Language    : TypeScript
Styling     : CSS Modules
State       : Zustand
Testing     : Jest
```

---

## **ENGINE-BASED GENERATION STRATEGY**

### **Global Rules**

```
1. Split the entire project into multiple Engines
2. Engine order must be from POC (basic) → Medium → Advanced
3. Only ONE Engine is generated at a time
4. After each Engine:
   - STOP execution
   - ASK for explicit user approval
5. No Engine may skip or compromise functionality
6. Each Engine must be independently testable and runnable
7. No Engine may assume implementation details of future Engines
```

---

## **ENGINE TEMPLATE (REPEAT FOR EVERY ENGINE)**

---

### **ENGINE 1 : POC — Core Builder Foundation**

---

### 1️⃣ Engine Objective

```
Establish the foundational architecture for the low-code builder.

This Engine proves that:
- A component can be dragged from a library
- Dropped onto a canvas
- Rendered deterministically using schema-driven rendering
```

---

### 2️⃣ Scope

**Inclusions**

```
- Application shell (Left Panel + Canvas)
- Component Library (Text, Button only)
- Grid-based canvas (static grid)
- Drag from left panel → drop into canvas
- Schema-driven rendering engine
- Zustand global store setup
```

**Exclusions**

```
- Component movement after drop
- Collision detection
- Style editor
- Live preview mode
- Export / deploy
- Undo / redo
```

---

### 3️⃣ Architecture (Micro-Level)

**Folder Structure**

```
src/
  common/
    components/
      button/
      text/
    utils/
      schema_renderer.ts
  pages/
    builder/
      components/
        left_panel.tsx
        canvas.tsx
      store/
        builder_store.ts
      index.tsx
```

**State Design (Zustand)**

```
builder_store:
  - components: ComponentSchema[]
  - addComponent(schema)
```

**Component Responsibilities**

```
LeftPanel:
  - Display draggable component list

Canvas:
  - Accept dropped components
  - Render components using schema_renderer

SchemaRenderer:
  - Convert schema → React component
```

**Data Flow**

```
Drag → Drop → Store Update → Schema Render → UI Output
```

---

### 4️⃣ Functional Flow (Step-by-Step)

```
1. User drags component from Left Panel
2. Drop event triggered on Canvas
3. Component schema created
4. Zustand store updates component list
5. Canvas re-renders using schema renderer
```

---

### 5️⃣ Flow Diagram (Textual)

```
User Drag
  ↓
Drop Event
  ↓
Schema Creation
  ↓
Zustand Store Update
  ↓
Canvas Render
```

---

### 6️⃣ Test Cases (Jest)

**Unit Tests**

```
- schema_renderer renders correct component
- component schema structure validation
```

**State Tests**

```
- addComponent correctly mutates store
```

**Rendering Tests**

```
- dropped component appears on canvas
```

**Edge / Failure Cases**

```
- invalid schema ignored safely
```

---

### 7️⃣ Exit Criteria

```
- Components can be dragged and dropped
- Canvas renders based purely on schema
- All tests pass
```

---

### **ENGINE EXECUTION CONTROL**

```
ENGINE 1 COMPLETE.
Do you approve proceeding to ENGINE 2?
```

---

## **ENGINE 2 : CORE — Deterministic Layout Movement & Collision Engine**

---

### 1️⃣ Engine Objective (Deep Clarification)

```
Introduce deterministic spatial intelligence into the canvas.

This Engine proves that:
- A placed component can be moved inside the canvas
- Movement is constrained strictly to a grid system
- No two components can ever overlap
- Layout behavior is predictable, reversible, and testable

This Engine transforms the canvas from a static drop-zone
into a controlled layout system without introducing styling,
preview, or export logic.
```

---

### 2️⃣ Scope (Strict Boundaries)

#### **Inclusions**

```
- Drag-to-move existing components inside canvas
- Grid-based snapping during movement
- Collision detection (4-directional)
- Position validation before commit
- Deterministic layout resolution
- Visual feedback for valid/invalid drop zones
```

#### **Explicit Exclusions**

```
- Component resizing
- Free-form (pixel-based) movement
- Z-index layering
- Undo / redo
- Style editor
- Preview mode
- Export logic
```

---

### 3️⃣ Architecture (Micro-Level Breakdown)

#### **Grid Model (Foundational Constraint)**

```
- Canvas is divided into fixed-size grid cells
- Grid size is constant (e.g., 12 columns, infinite rows)
- Every component occupies:
  - gridX (column start)
  - gridY (row start)
  - gridW (column span)
  - gridH (row span)
- No fractional grid positions allowed
```

> ⚠️ All movement logic MUST resolve to integer grid positions only.

---

#### **Folder Structure (Strict Additions Only)**

```
src/
  common/
    utils/
      grid.ts                // Grid math & snapping
      collision.ts           // Collision detection logic
      layout_resolver.ts     // Valid position resolution

  pages/
    builder/
      components/
        canvas_item.tsx      // Draggable wrapper for placed components
      hooks/
        use_drag_move.ts     // Drag movement orchestration
      store/
        builder_store.ts     // Extended layout state
```

> ❌ No new folders beyond these
> ❌ No merging logic into UI components

---

### 4️⃣ State Design (Zustand — Precise Schema)

#### **Extended Component Schema**

```
ComponentSchema:
  - id: string
  - type: "text" | "button"
  - grid:
      - x: number
      - y: number
      - w: number
      - h: number
```

#### **Builder Store Extensions**

```
builder_store:
  - components: ComponentSchema[]

  - actions:
      startMove(id)
      updateTempPosition(id, gridX, gridY)
      commitPosition(id)
      cancelMove(id)
```

#### **State Rules (Non-Negotiable)**

```
- No mutation without validation
- Temporary movement state is isolated
- Final commit only happens after collision resolution
- Store is the single source of truth
```

---

### 5️⃣ Core Utilities (Algorithm-Level Detail)

#### **grid.ts**

```
Responsibilities:
- Convert mouse position → grid position
- Clamp grid position to canvas bounds
- Snap movement to nearest valid grid cell

Functions:
- pixelToGrid(x, y)
- clampGridPosition(x, y)
- normalizeGridPosition(x, y)
```

---

#### **collision.ts**

```
Responsibilities:
- Detect overlap between two grid rectangles
- Detect collision in all directions

Functions:
- isOverlapping(a, b)
- detectCollision(target, allComponents)
```

**Collision Rule**

```
Two components collide if:
- gridX ranges overlap AND
- gridY ranges overlap
```

---

#### **layout_resolver.ts**

```
Responsibilities:
- Determine whether a move is valid
- Reject illegal positions
- (No auto-reflow in this Engine)

Functions:
- isPositionValid(component, proposedPosition, layout)
```

> ❌ No auto-push / auto-reflow logic allowed here
> ❌ That belongs to a future Engine only

---

### 6️⃣ Component Responsibilities (Granular)

#### **CanvasItem**

```
- Wraps a rendered schema component
- Handles mouse down / move / up
- Delegates all logic to use_drag_move hook
- NEVER performs collision logic directly
```

---

#### **use_drag_move Hook (Orchestrator)**

```
Responsibilities:
1. Capture initial mouse position
2. Track mouse movement
3. Convert pixel movement → grid movement
4. Call collision + validation utilities
5. Update temporary store position
6. Commit or revert on mouse release
```

**Lifecycle**

```
onMouseDown → startMove
onMouseMove → updateTempPosition
onMouseUp   → commitPosition OR cancelMove
```

---

### 7️⃣ Deterministic Data Flow

```
Mouse Down
  ↓
Drag Start (store.startMove)
  ↓
Mouse Move
  ↓
pixel → grid conversion
  ↓
collision check
  ↓
valid? → updateTempPosition
invalid? → ignore
  ↓
Mouse Up
  ↓
commitPosition
```

---

### 8️⃣ Visual Feedback Rules (Minimal but Required)

```
- Valid position → normal opacity
- Invalid position → reduced opacity / dashed outline
- No animations
- No transitions
```

---

### 9️⃣ Functional Flow (Step-by-Step)

```
1. User clicks a placed component
2. Drag begins
3. Mouse movement tracked
4. Position snapped to grid
5. Collision checked against all components
6. If valid → temporary position applied
7. On release → position committed
8. If invalid → revert to original position
```

---

### 🔟 Flow Diagram (Textual)

```
User Drag
  ↓
Grid Snap
  ↓
Collision Check
  ↓
Validation
  ↓
Temp Store Update
  ↓
Commit or Revert
```

---

### 1️⃣1️⃣ Test Strategy (Non-Negotiable)

#### **Unit Tests**

```
- grid snapping accuracy
- collision detection correctness
- boundary clamping
```

#### **Store Tests**

```
- position updates are deterministic
- invalid moves are rejected
- cancelMove restores previous state
```

#### **Integration Tests**

```
- dragging component does not overlap others
- layout remains stable after multiple moves
```

---

### 1️⃣2️⃣ Exit Criteria (Hard Gate)

```
✔ Components move only on grid
✔ No overlaps possible
✔ Layout is deterministic
✔ All tests pass
✔ No future assumptions introduced
```

## **ENGINE 3 : ADVANCED — Style Editor, Live Preview & Export**

---

### 1️⃣ Engine Objective

```
Deliver full WYSIWYG capability:
- Style configuration
- Live preview
- Exportable static output
```

---

### 2️⃣ Scope

**Inclusions**

```
- Style editor panel
- Style schema binding
- Live preview mode
- Static export (HTML + CSS + JSON)
```

**Exclusions**

```
- Server-side rendering
- Backend APIs
```

---

### 3️⃣ Architecture (Micro-Level)

**Folder Structure**

```
builder/
  panels/
    style_editor.tsx
  preview/
    preview_renderer.tsx
  export/
    export_engine.ts
```

**State Design (Zustand)**

```
styleStore:
  - stylesByComponentId
  - updateStyle()
```

**Component Responsibilities**

```
StyleEditor:
  - Modify component style schema

PreviewRenderer:
  - Render schema without editor UI

ExportEngine:
  - Serialize schema to static assets
```

**Data Flow**

```
Style Change → Schema Update → Preview Render → Export Output
```

---

### 4️⃣ Functional Flow

```
1. User edits style
2. Style schema updates
3. Preview re-renders instantly
4. Export serializes schema
5. Output matches preview exactly
```

---

### 5️⃣ Flow Diagram

```
Style Change
  ↓
Schema Update
  ↓
Live Preview
  ↓
Export
```

---

### 6️⃣ Test Cases

```
- style application correctness
- preview/export parity
- export asset validity
```

---

### 7️⃣ Exit Criteria

```
- Preview and export output are identical
- No runtime dependency
- All tests pass
```

---

### **ENGINE EXECUTION CONTROL**

```
ENGINE 3 COMPLETE.
Do you approve project completion?
```

---

## **GLOBAL CONSTRAINTS**

```
- No architectural shortcuts
- No skipped tests
- No assumptions about future Engines
- Deterministic rendering only
```

---

### **START CONDITION**

```
Begin with ENGINE 1.
Wait for explicit user approval after each Engine.
```
