# SgetAI Pro Dashboard - Pixel-Perfect UI Design System

**Source:** Live website screenshot analysis + Playwright extraction  
**Date:** 2026-06-20  
**Accuracy:** Pixel-perfect reverse engineering from actual product  
**Version:** 2.0 - Detailed specification

---

## Table of Contents

1. [Overall Layout](#overall-layout)
2. [Hero Banner Section](#hero-banner-section)
3. [Automation Engine Section](#automation-engine-section)
4. [Activity Feed Section](#activity-feed-section)
5. [Career Copilot Widget](#career-copilot-widget)
6. [Job Recommendations Section](#job-recommendations-section)
7. [Color System](#color-system)
8. [Typography](#typography)
9. [Spacing & Grid](#spacing--grid)
10. [Component Specifications](#component-specifications)

---

## Overall Layout

### Main Container Structure

```
┌─────────────────────────────────────────────────────────────────┐
│ HEADER (Search + Switcher + Menu)                              │
├──────────────────┬────────────────────────────────────────────┤
│                  │                                            │
│ SIDEBAR          │ MAIN CONTENT AREA                         │
│ (280px, sticky)  │ (flex: 1, max-width: 1400px)             │
│                  │                                            │
│ • Home           │ ┌──────────────────────────────────────┐ │
│ • Profile        │ │ HERO BANNER (full width)             │ │
│ • AI Generator   │ │ • Gradient background (P to C)       │ │
│ • Jobs           │ │ • Headline + Metrics (4 columns)    │ │
│ • Applied        │ └──────────────────────────────────────┘ │
│ • Learn          │                                            │
│ • Help           │ ┌──────────────────────────────────────┐ │
│ • Settings       │ │ AUTOMATION SECTION (full width)     │ │
│                  │ │ • Title + Active Badge               │ │
│                  │ │ • 3 Feature Cards + Toggles         │ │
│                  │ └──────────────────────────────────────┘ │
│                  │                                            │
│                  │ ┌──────────────────┬──────────────────┐  │
│                  │ │ ACTIVITY FEED    │ CAREER COPILOT   │  │
│                  │ │ (2 col)          │ (1 col, sticky)  │  │
│                  │ │                  │                  │  │
│                  │ │ • Items list     │ • Message        │  │
│                  │ │ • Icon + Text    │ • Quick actions  │  │
│                  │ │ • Metadata       │ • Input field    │  │
│                  │ └──────────────────┴──────────────────┘  │
│                  │                                            │
│                  │ ┌──────────────────────────────────────┐ │
│                  │ │ JOB RECOMMENDATIONS (full width)    │ │
│                  │ │ • Grid of job cards (3 columns)    │ │
│                  │ │ • Title, Company, Salary, Skills   │ │
│                  │ │ • Match % (top right)              │ │
│                  │ │ • Auto-applied badge               │ │
│                  │ └──────────────────────────────────────┘ │
│                  │                                            │
└──────────────────┴────────────────────────────────────────────┘
```

### Breakpoints
- **Mobile:** < 640px (single column, hero full width)
- **Tablet:** 640px - 1024px (responsive adjustments)
- **Desktop:** > 1024px (full 2-3 column layouts)

---

## Hero Banner Section

### Visual Specification

**Dimensions:**
- Full width of main content area
- Padding: 32px (top/bottom), 32px (left/right)
- Border radius: 12px
- Margin bottom: 20px

**Background:**
```
Linear Gradient:
  Start: #7c3aed (Purple, 100%)
  Middle: #3b82f6 (Blue, 50%)
  End: #06b6d4 (Cyan, 100%)
  Angle: 135deg (top-left to bottom-right)
```

**Text Colors:**
- All text: #ffffff (white)
- Opacity variations: 100% for headline, 90% for sub

**Content Structure:**

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│ ✨ AI is working for you                               │
│                                                         │
│ 12 jobs auto-applied this week                         │
│                                                         │
│ 3 recruiters responded • 2 interviews scheduled •       │
│ avg match 88%                                          │
│                                                         │
│ ────────────────────────────────────────────────────   │
│                                                         │
│  ⚡ 247          📊 88%         📈 4.2x       🔗 38     │
│  JOBS SCANNED  AVG MATCH      REPLY RATE    CONNECTS  │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Typography Details

| Element | Font Size | Weight | Line Height | Letter Spacing |
|---------|-----------|--------|-------------|----------------|
| Status Badge | 12px | 500 | 1.4 | 0px |
| H1 Headline | 32px | 700 | 1.2 | -0.5px |
| Subheadline | 14px | 400 | 1.5 | 0px |
| Metric Value | 32px | 700 | 1.2 | 0px |
| Metric Label | 12px | 600 | 1.3 | 0.5px uppercase |

### Metrics Grid

**Layout:** 4 equal columns on desktop, 2x2 on tablet, 1 column on mobile
**Gap:** 24px between columns, 16px between rows
**Each Metric Card:**
- Icon: 40px size, centered
- Value: Large bold number
- Label: Small uppercase text
- Alignment: Centered

---

## Automation Engine Section

### Section Container

**Styling:**
- Background: #ffffff (white)
- Border: 1px solid #f3f4f6 (light gray)
- Border-radius: 8px
- Padding: 20px
- Margin bottom: 24px
- Box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05)

### Section Header

```
┌────────────────────────────────────────────────┐
│ AUTOMATION ENGINE (12px, uppercase, gray)     │
│ Pro AI is on duty        [● Active] (green)   │
└────────────────────────────────────────────────┘
```

**Layout:** Flex, space-between
- Left: Title + Label
- Right: Active badge (when enabled)

**Typography:**
- Label: 12px, 600 weight, uppercase, #9ca3af (gray)
- Heading: 20px, 600 weight, #1f2937 (dark gray)
- Margin between: 8px

**Active Badge:**
- Background: #dcfce7 (light green)
- Text: #15803d (dark green)
- Icon: Animated pulsing dot (●)
- Padding: 6px 12px
- Border-radius: 20px
- Font size: 12px, semibold

### Feature Cards (3 items)

**Layout:** Vertical stack, 12px gap

**Card Structure:**
```
┌──────────────────────────────────────────────┐
│ [Icon] Title               [Toggle Switch]   │
│        Description text                      │
└──────────────────────────────────────────────┘
```

**Card Styling:**
- Background: #f9fafb (light gray)
- Padding: 12px
- Border-radius: 6px
- Border: none
- Hover: bg-gray-100 (#f3f4f6)
- Transition: 200ms

**Icon:**
- Size: 24px emoji
- Left-aligned

**Content:**
- Title: 14px, 600 weight, #1f2937
- Description: 12px, 400 weight, #6b7280 (gray)
- Margin-top between title/desc: 4px

**Toggle Switch:**
- Dimensions: 44px width × 24px height
- On: #10b981 (green) with white knob shifted right
- Off: #d1d5db (light gray) with white knob shifted left
- Border-radius: 12px (pill-shaped)
- Transition: 200ms cubic-bezier(0.4, 0, 0.2, 1)
- On-click: Smooth slide animation

---

## Activity Feed Section

### Container & Header

**Layout:** 2 columns on desktop (col-span-2 of 3)
**Styling:** White background, 1px gray border, 8px radius

**Header:**
```
┌────────────────────────────────────────────┐
│ LIVE (12px, uppercase, gray label)         │
│ AI activity feed (20px, semibold heading)  │
└────────────────────────────────────────────┘
```

### Activity Feed Items

**Layout:** Vertical stack, 8px gap
**Item height:** ~60-80px depending on content

**Item Structure:**
```
┌─────────────────────────────────────────────────────────┐
│ [Icon] Applied to Senior Frontend Engineer              │
│        Linear • 94% match • tailored resume v3           │
│        12 min ago                            [✓] Status  │
└─────────────────────────────────────────────────────────┘
```

**Card Styling:**
- Background: #ffffff
- Padding: 12px
- Border-radius: 6px
- Border: 1px #f0f0f0
- Hover: shadow increase
- Transition: 150ms

**Icon:**
- Emoji: 20px
- Left side, vertically centered
- Margin-right: 12px

**Content:**
- Title: 13px, 500 weight, #1f2937
- Line height: 1.4
- Metadata row below:
  - Company: 12px, #6b7280
  - Match: 12px, badge style (blue bg #dbeafe)
  - Time: 12px, #9ca3af
  - Gap between: 12px

**Status Indicator (right side):**
- ✓ (green): Success
- ⏳ (amber): Pending
- ✕ (red): Failed
- Size: 16px, bold
- Vertically centered

---

## Career Copilot Widget

### Container

**Position:** Sticky, top: 24px (stays visible when scrolling)
**Layout:** Right column (col-span-1 of 3)
**Styling:**
- Background: #ffffff
- Border: 1px solid #f3f4f6
- Border-radius: 8px
- Padding: 20px
- Box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1)
- Width: auto (responsive)

### Header Section

```
┌─────────────────────────────────────────┐
│ 🎯 Career Copilot          [Pro] badge  │
│ Online • Pro automation enabled          │
└─────────────────────────────────────────┘
```

**Layout:** Two lines
- Line 1: Icon (24px) + Title (16px, 600 weight) + Badge
- Line 2: Status text (12px, gray)

**Pro Badge:**
- Background: #dbeafe (light blue)
- Text: #0369a1 (dark blue)
- Padding: 4px 10px
- Border-radius: 12px
- Font-size: 11px, bold

### Message Area

**Styling:**
- Background: #f9fafb
- Padding: 12px
- Border-radius: 6px
- Margin: 12px 0
- Font-size: 13px
- Line-height: 1.5
- Color: #1f2937

**Example Text:**
```
Morning, Alex 👋 Which job are we grabbing today?
I can tailor a resume, draft a LinkedIn post, or match
you with new openings.
```

### Quick Action Buttons

**Layout:** 2×2 grid
**Gap:** 8px between buttons
**Total height:** ~80px

**Button Styling (each):**
- Background: #dbeafe (light blue)
- Text: #2563eb (medium blue)
- Padding: 10px 8px
- Border-radius: 6px
- Font-size: 12px
- Font-weight: 500
- Hover: bg-blue-200
- Border: none
- Cursor: pointer
- Transition: 150ms

**Button Labels:**
- Top-left: "Tailor resume"
- Top-right: "Draft LinkedIn post"
- Bottom-left: "Match jobs to me"
- Bottom-right: "Write recruiter DM"

### Input Section

**Layout:** Flex row with gap
**Margin-top:** 12px

**Input Field:**
- Placeholder: "Paste a JD, ask for a post..."
- Font-size: 12px
- Padding: 8px 12px
- Border: 1px solid #d1d5db
- Border-radius: 6px
- Background: #ffffff
- Focus: outline none, ring 2px blue-500

**Send Button:**
- Background: #2563eb (blue)
- Text: →
- Color: white
- Padding: 8px 12px
- Border-radius: 6px
- Hover: #1d4ed8
- Cursor: pointer

---

## Job Recommendations Section

### Container & Header

**Full Width**
**Styling:** White background, 1px gray border, 8px radius, padding: 20px

**Header:**
```
┌────────────────────────────────────────────┐
│ RANKED BY MATCH (12px, uppercase, gray)   │
│ AI-curated for you (20px, semibold)       │
└────────────────────────────────────────────┘
```

### Job Card Grid

**Layout:** 3 columns on desktop, 2 on tablet, 1 on mobile
**Gap:** 16px between cards
**Max cards shown:** 6-8 before scroll

### Individual Job Card

**Dimensions:** ~240px width (responsive)
**Card Height:** ~280-320px

**Card Structure:**
```
┌─────────────────────────────────────────┐
│ Senior Frontend Engineer       [94%] ✓   │
│                                          │
│ Linear • San Francisco, CA              │
│ $180K - $240K                          │
│                                          │
│ React  TypeScript  Design Systems       │
│ +2 more                                 │
│                                          │
│ Auto-applied • 12 min ago              │
└─────────────────────────────────────────┘
```

**Card Styling:**
- Background: #ffffff
- Border: 1px solid #f3f4f6
- Border-radius: 8px
- Padding: 16px
- Box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05)
- Hover: shadow increase to 0 8px 12px rgba(0, 0, 0, 0.1)
- Transition: 200ms

### Card Content Details

**Title Row (top):**
- Layout: Flex, space-between
- Title: 14px, 600 weight, #1f2937, left-aligned
- Match %: Colored badge, right-aligned
  - 85%+: #dcfce7 bg, #15803d text
  - 70-84%: #fef3c7 bg, #92400e text
  - <70%: #fee2e2 bg, #991b1b text

**Meta Information:**
- Company: 12px, #6b7280, margin-top: 8px
- Location: 12px, #6b7280
- Salary: 12px, 500 weight, #1f2937, margin-top: 4px

**Skills Section:**
- Label: "Required Skills" (hidden on small cards, implied)
- Max 3 tags shown
- Tags: 11px, light background (#f0f4ff), #486281 text
- Padding: 4px 8px per tag
- Border-radius: 12px
- "+N more" if >3 skills

**Footer:**
- Layout: Flex, space-between
- Auto-applied badge: 11px, green text, left side
- Time: 11px, #9ca3af, right side
- Examples: "Auto-applied", "12 min ago"

---

## Color System

### Primary Palette

| Color | Hex | RGB | Usage |
|-------|-----|-----|-------|
| **Purple (Primary)** | #7c3aed | 124, 58, 237 | Hero gradient start |
| **Blue (Primary)** | #3b82f6 | 59, 130, 246 | Hero gradient middle |
| **Cyan (Primary)** | #06b6d4 | 6, 182, 212 | Hero gradient end |

### Neutral Palette

| Color | Hex | Usage |
|-------|-----|-------|
| White | #ffffff | Card backgrounds, text backgrounds |
| Light Gray BG | #f9fafb | Section backgrounds, card backgrounds |
| Light Gray Border | #f3f4f6 | Card borders |
| Medium Gray | #d1d5db | Disabled elements, secondary borders |
| Text Gray | #6b7280 | Secondary text, metadata |
| Text Gray Dark | #9ca3af | Tertiary text, muted labels |
| Text Dark | #1f2937 | Primary text, headings |
| Text Darkest | #111827 | Extra emphasis |

### Status Colors

| Status | Hex | Usage |
|--------|-----|-------|
| Success (Green) | #10b981 | Active badges, success indicators |
| Warning (Amber) | #f59e0b | Pending states, caution |
| Danger (Red) | #ef4444 | Errors, failed states |
| Info (Blue) | #2563eb | Links, information |

### Match Percentage Colors

| Range | Background | Text | Usage |
|-------|------------|------|-------|
| 85%+ | #dcfce7 | #15803d | Excellent match |
| 70-84% | #fef3c7 | #92400e | Good match |
| 50-69% | #fee2e2 | #991b1b | Fair/Low match |

---

## Typography

### Font Family
- **Primary:** System fonts: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`
- **Display (optional):** Sora or similar for headings

### Font Weight Scale

| Weight | Usage | Examples |
|--------|-------|----------|
| 400 | Body text, descriptions | Subheadlines, body copy |
| 500 | Medium emphasis | Labels, tab text, toggle labels |
| 600 | Strong emphasis | Card titles, section headings, buttons |
| 700 | Maximum emphasis | Hero headlines, metric values |

### Size Scale

| Size | Usage | Examples |
|------|-------|----------|
| 11px | Smallest | Button text, "+more" text |
| 12px | Small | Labels, metadata, tags, captions |
| 13px | Activity feed titles |  |
| 14px | Body & card titles | Standard text, section labels |
| 16px | Medium | Widget title, slightly larger body |
| 20px | Section heading | "Pro AI is on duty", "AI activity feed" |
| 24px | Not used in this design |  |
| 32px | Large | Hero headline numbers, metric values |

### Line Heights

| Context | Value |
|---------|-------|
| Headings | 1.2 |
| Subheadings | 1.3 |
| Body text | 1.5 |
| Tight labels | 1.4 |

---

## Spacing & Grid System

### Spacing Scale

```
4px  (xs) - Minimal gaps, tight layouts
8px  (sm) - Small element spacing
12px (md) - Standard padding on cards
16px (lg) - Standard gap between sections
20px (xl) - Section margin
24px (2xl) - Large margin
32px (3xl) - Page padding, hero padding
```

### Component Padding

| Component | Padding |
|-----------|---------|
| Hero Banner | 32px all |
| Sections | 20px all |
| Cards | 12-16px all |
| Input fields | 8px 12px |
| Buttons | 8-10px |
| Tags/Badges | 4px 8px |

### Gap/Margin

| Context | Value |
|---------|-------|
| Between major sections | 20-24px |
| Between cards in grid | 16px |
| Between items in list | 8-12px |
| Between elements in flex | 8-12px |
| Hero metrics grid | 24px column, 16px row |
| Quick action buttons | 8px |

---

## Component Specifications

### 1. Hero Banner Component

```jsx
<HeroBanner
  status="✨ AI is working for you"
  headline="12 jobs auto-applied this week"
  subheadline="3 recruiters responded • 2 interviews scheduled • avg match 88%"
  metrics={[
    { icon: "⚡", value: 247, label: "JOBS SCANNED" },
    { icon: "📊", value: "88%", label: "AVG MATCH" },
    { icon: "📈", value: "4.2x", label: "REPLY RATE" },
    { icon: "🔗", value: 38, label: "AUTO-CONNECTS" },
  ]}
/>
```

### 2. Automation Section Component

```jsx
<AutomationSection
  features={[
    {
      id: "auto-apply",
      icon: "🎯",
      name: "Auto-apply engine",
      description: "Apply to jobs that meet your benchmark — automatically.",
      enabled: true,
    },
    // ...
  ]}
/>
```

### 3. Activity Feed Component

```jsx
<ActivityFeed
  items={[
    {
      type: "application",
      title: "Applied to Senior Frontend Engineer",
      metadata: { company: "Linear", match: 94 },
      timestamp: "12 min ago",
      status: "success",
    },
    // ...
  ]}
/>
```

### 4. Career Copilot Component

```jsx
<CareerCopilot
  message="Morning, Alex 👋 Which job are we grabbing today?..."
  actions={[
    { label: "Tailor resume", icon: "📄" },
    { label: "Draft LinkedIn post", icon: "💼" },
    // ...
  ]}
/>
```

### 5. Job Card Component

```jsx
<JobCard
  job={{
    title: "Senior Frontend Engineer",
    company: "Linear",
    location: "San Francisco, CA",
    salary: { min: 180000, max: 240000 },
    skills: ["React", "TypeScript", "Design Systems"],
    matchPercentage: 94,
    status: "auto-applied",
    appliedTime: "12 min ago",
  }}
/>
```

---

## Responsive Behavior

### Desktop (> 1024px)
- Full 2-column layout (Activity Feed + Copilot side-by-side)
- 3-column job grid
- All spacing at full size
- Sticky Career Copilot

### Tablet (640px - 1024px)
- Single column, sections stack
- 2-column job grid
- Reduced padding (20px → 16px)
- Career Copilot below Activity Feed
- Spacing reduced by 20%

### Mobile (< 640px)
- Full-width single column
- 1-column job grid
- Minimal padding (12px)
- Career Copilot below feed
- Compact spacing
- Smaller text sizes (-2% reduction)

---

## Shadows & Elevation

| Level | Specification | Usage |
|-------|---------------|-------|
| 1 | 0 2px 4px rgba(0,0,0,0.05) | Card default |
| 2 | 0 4px 8px rgba(0,0,0,0.08) | Card hover |
| 3 | 0 8px 16px rgba(0,0,0,0.1) | Career Copilot |
| 4 | 0 10px 30px rgba(0,0,0,0.1) | Copilot emphasis |

---

## Animations & Transitions

### Standard Timing
- **Fast:** 150ms (small interactions: hover color)
- **Base:** 200ms (card elevation, toggles)
- **Slow:** 300ms (page transitions, modals)

### Easing Function
- **Standard:** cubic-bezier(0.4, 0, 0.2, 1)
- **Used for:** All transitions, toggle switches, hovers

### Applied Animations

1. **Toggle Switch:**
   - Position slide: 200ms
   - Color change: 200ms
   - Knob shift: translateX

2. **Card Hover:**
   - Shadow increase: 200ms
   - Slight lift: -2px translateY (optional)

3. **Activity Feed Item:**
   - Hover shadow: 150ms

---

## Design Tokens (CSS Variables)

```css
:root {
  /* Colors */
  --color-purple: #7c3aed;
  --color-blue: #3b82f6;
  --color-cyan: #06b6d4;
  --color-success: #10b981;
  --color-white: #ffffff;
  --color-text-dark: #1f2937;
  --color-text-gray: #6b7280;
  --color-border: #f3f4f6;
  --color-bg-light: #f9fafb;
  
  /* Spacing */
  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 12px;
  --space-lg: 16px;
  --space-xl: 20px;
  --space-2xl: 24px;
  --space-3xl: 32px;
  
  /* Radius */
  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-full: 20px;
  
  /* Shadows */
  --shadow-sm: 0 2px 4px rgba(0, 0, 0, 0.05);
  --shadow-md: 0 4px 8px rgba(0, 0, 0, 0.08);
  --shadow-lg: 0 8px 16px rgba(0, 0, 0, 0.1);
  
  /* Transitions */
  --transition-fast: 150ms cubic-bezier(0.4, 0, 0.2, 1);
  --transition-base: 200ms cubic-bezier(0.4, 0, 0.2, 1);
}
```

---

## Implementation Checklist

- [ ] Hero banner with gradient background
- [ ] 4-metric grid layout and styling
- [ ] Automation section with 3 feature cards
- [ ] iOS-style toggle switches
- [ ] Activity feed with icon + text + metadata
- [ ] 2-column layout (feed + copilot)
- [ ] Career Copilot sticky positioning
- [ ] Job recommendation 3-column grid
- [ ] Color-coded match percentages
- [ ] Proper spacing throughout
- [ ] Responsive breakpoints
- [ ] Hover and transition effects
- [ ] Typography consistency
- [ ] All shadows and elevation levels

---

**Status:** Pixel-perfect specification ready for implementation  
**Last Updated:** 2026-06-20  
**Next Step:** Update all frontend components to match this specification exactly
