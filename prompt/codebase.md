# 🚀 **Frontend Codebase Standards**

## 📁 Project Structure

```
src/
  assets/                     # Static files only (images/icons)
    ├── logo/
    ├── icons/
    └── <page_name>/         # Page-specific static images only

  common/                     # Shared + reusable modules only
    ├── components/           # Reusable UI components
    ├── utils/                # Pure reusable utilities (no side effects)
    ├── constants/            # Global constants
    └── hooks/                # Custom reusable hooks

  pages/                      # Route-scoped isolated modules
    <page_name>/
      ├── index.tsx           # Page entry (UI only — declarative)
      ├── components/         # Page-local components only
      ├── style.module.css    # Page-local styling only
      ├── utils.ts            # Page-local utilities only
      └── constants.ts        # Page-local constants only

  theme/
    ├── override.css          # Overrides: native HTML + external library styles
    ├── colors.css            # Theme color tokens (primary/secondary/white/gray/black)
    └── font.css              # Font imports and definitions

  App.tsx                     # Routing only — zero business logic
```

---

## 🎨 Theme Tokens — `/theme/colors.css`

- Must define only these semantic groups:
  **primary**, **secondary**, **white**, **gray**, **black**
- Variants allowed: `25 / 50 / 100 / ... / 900`
- No additional/random color categories permitted.

(Your existing color scheme meets this rule.)

---

## 🔒 Architectural Boundaries

| Allowed                     | Not Allowed                       |
| --------------------------- | --------------------------------- |
| Shared logic → `/common/`   | Shared logic inside pages         |
| Page-only logic → `/pages/` | Page components inside `/common/` |
| Static → `/assets/`         | JavaScript inside `assets/`       |
| Global styling → `/theme/`  | Global styling inside `pages/`    |
| Routing → `App.tsx`         | Business logic in `App.tsx`       |

**Explicitly Forbidden:**

- Tailwind
- Inline CSS
- Styled-components
- Global CSS outside `/theme/`
- Shared hooks/components/constants inside `/pages/`

---

## 🧩 Naming Conventions (Strict)

| Category   | Format                 |
| ---------- | ---------------------- |
| folders    | `snake_case`           |
| components | `snake_case`           |
| utilities  | `lowercase`            |
| hooks      | `useCamelCase`         |
| constants  | `SCREAMING_SNAKE_CASE` |
| icons      | `kebab-case`           |
| styles     | `style.module.css`     |

**Never use uppercase letters in folder names.**

---

## 📏 Component Constraints

- Max **200 lines** per component
- One component per file
- UI must be pure + declarative
- Side effects only inside hooks
- Split large features → `UI` + `logic`

---

## 🎨 Styling Rules

- **CSS Modules only**
- Scope must remain local
- No global styles except in `/theme/`
- No inline style props
- No Tailwind / styled-components

---

## 🧠 Logic Placement Rules

| Logic Scope      | Must live in |
| ---------------- | ------------ |
| shared logic     | `/common/`   |
| page-local logic | `/pages/`    |
| global theme     | `/theme/`    |
| static assets    | `/assets/`   |
