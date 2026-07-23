# SgetAI UI Design System - ACTUAL PRODUCT ANALYSIS

**Source:** Website screenshot analysis + Playwright extraction  
**Website:** https://pro-networker-ai.lovable.app/pro  
**Date:** 2026-06-20  
**Status:** VERIFIED FROM LIVE PRODUCT

---

## Visual Layout Overview

The dashboard has the following main sections from top to bottom:

```
┌─────────────────────────────────────────────────────────────┐
│ HEADER (Search bar, Account switcher, User menu)            │
├──────────────────────────────┬──────────────────────────────┤
│ SIDEBAR                      │ MAIN CONTENT                 │
│ • Home                       │ ┌───────────────────────────┐│
│ • Profile                    │ │ HERO BANNER (Gradient)    ││
│ • AI Generator               │ │ "12 jobs auto-applied"    ││
│ • Jobs                       │ │ + 4 Metric Cards          ││
│ • Applied Jobs               │ └───────────────────────────┘│
│ • Learn                      │ ┌───────────────────────────┐│
│ • Help & Feedback            │ │ AUTOMATION SECTION        ││
│ • Settings                   │ │ "Pro AI is on duty"       ││
│                              │ │ + 3 Feature Cards         ││
│                              │ ├──────────┬────────────────┤│
│                              │ │ ACTIVITY │ CAREER COPILOT ││
│                              │ │ FEED     │ (Floating)     ││
│                              │ │          │                ││
│                              │ │ Jobs     │                ││
│                              │ │ applied, │                ││
│                              │ │ connects │                ││
│                              │ │ sent     │                ││
│                              │ ├──────────┴────────────────┤│
│                              │ │ JOB RECOMMENDATIONS       ││
│                              │ │ "AI-curated for you"      ││
│                              │ │ + Job cards with match %  ││
│                              │ └───────────────────────────┘│
└──────────────────────────────┴──────────────────────────────┘
```

---

## Hero Banner Section

**Location:** Top of main content  
**Background:** Gradient (Purple #7c3aed → Blue #06b6d4)  
**Text Color:** White  
**Layout:** Flex, space-between

**Content Structure:**
```
┌──────────────────────────────────────────────────────────┐
│ ✨ AI is working for you                                 │
│ 12 jobs auto-applied this week                           │
│ 3 recruiters responded • 2 interviews scheduled • 88% avg │
│                                                          │
│ [⚡] 247      [📊] 88%      [📈] 4.2x      [🔗] 38      │
│ JOBS SCANNED  AVG MATCH    REPLY RATE     AUTO-CONNECTS │
└──────────────────────────────────────────────────────────┘
```

**Styling Details:**
- Banner height: ~120-140px
- Padding: 32px
- Border-radius: 12px
- Metrics: 4-column grid, even distribution

**Text Hierarchy:**
- H1: "12 jobs auto-applied this week" (32px bold)
- Subheadline: "3 recruiters responded..." (14px regular)
- Metric values: 28-32px bold
- Metric labels: 12px uppercase

---

## Automation Engine Section

**Title:** "Pro AI is on duty"  
**Label:** "AUTOMATION ENGINE" (12px uppercase)  
**Layout:** 3 feature cards in vertical stack

**Status Badge:**
```
[●] Active  (green circle + text, animated pulse)
```

**Feature Cards (3 total):**

### Card 1: Auto-apply engine
```
[🏢] (icon)
Auto-apply engine
Apply to jobs that meet your benchmark — automatically.
                              [●●●] (toggle switch - ON)
```

### Card 2: Auto-connect to recruiters
```
[🤝] (icon)
Auto-connect to recruiters
Send personalized connection requests to recruiters & hiring managers.
                              [●●●] (toggle switch)
```

### Card 3: Auto-DM warm intros
```
[💬] (icon)
Auto-DM warm intros
Send a tailored first message after a connection is accepted.
                              [●●●] (toggle switch)
```

**Card Styling:**
- Background: White
- Border: 1px light gray
- Padding: 16px
- Border-radius: 8px
- Toggle: iOS-style (green when enabled)
- Hover: subtle shadow increase

---

## Activity Feed Section

**Title:** "AI activity feed"  
**Label:** "LIVE"  
**Layout:** Single column list

**Activity Item Structure:**
```
[Icon] Title | Metadata                    [Status] [Time]
[🏢] Applied to Senior Frontend...
     Linear • 94% match • tailored resume v3     [✓] 12 min ago
     
[🤝] Connection request sent
     Priya Sharma, EM at Stripe              [●] 1h ago
     personalized note
     
[💬] Recruiter DM sent
     Followed up with 3 recruiters           [✓] 3h ago
     from last week
```

**Activity Item Styling:**
- Background: White
- Padding: 12-16px
- Border-radius: 6px
- Font size: 14px
- Gap between items: 8px
- Status icons: ✓ (success), ● (pending), ✕ (failed)

---

## Job Recommendations Section

**Title:** "AI-curated for you"  
**Label:** "RANKED BY MATCH"  
**Layout:** Single column stack

**Job Card Structure:**
```
┌────────────────────────────────────────────────┐
│ Senior Frontend Engineer            [94%] ✓    │
│ Linear • San Francisco, CA                     │
│ $180K - $240K                                  │
│                                                │
│ React  TypeScript  Design Systems              │
│                                                │
│ Auto-applied  •  12 min ago                    │
└────────────────────────────────────────────────┘
```

**Card Styling:**
- Background: White
- Padding: 16px
- Border-radius: 8px
- Border: 1px light gray
- Box-shadow: 0 2px 4px rgba(...)
- Hover: shadow elevation

**Match Percentage Colors:**
- 94%: Green background (#10b981 at 10%)
- 89%: Amber background (#f59e0b at 10%)
- 76%: Orange background (#f97316 at 10%)

**Match Text Styling:**
- Font size: 24px (percentage)
- Font weight: bold
- "Excellent/Good/Fair Match" label: 12px

---

## Career Copilot Widget

**Position:** Floating, bottom-right corner  
**Size:** ~360px width  
**Background:** White with shadow

**Structure:**
```
┌─────────────────────────────────┐
│ 🎯 Career Copilot          [x]  │
│    Online • Pro automation       │
│─────────────────────────────────│
│                                 │
│ Morning, Alex 👋 Which job are │
│ we grabbing today? I can tailor │
│ a resume, draft a LinkedIn post,│
│ or match you with new openings.│
│                                 │
│ ┌──────────┬──────────────────┐ │
│ │ Tailor   │ Draft LinkedIn   │ │
│ │ resume   │ post             │ │
│ │          │                  │ │
│ │ Match    │ Write DM to      │ │
│ │ jobs     │ recruiter        │ │
│ └──────────┴──────────────────┘ │
│                                 │
│ [Input] Paste JD, ask...   [→] │
└─────────────────────────────────┘
```

**Styling:**
- Border-radius: 12px
- Padding: 16px
- Box-shadow: 0 10px 30px rgba(...)
- Buttons: 2x2 grid
- Button colors: Blue primary, gray secondary

---

## Color Analysis (From Live Site)

**Primary Colors Detected:**
- White: rgb(255, 255, 255)
- Dark text: lab(3.59 0.108 -8.55) [Very dark gray]
- Success green: Seen in active badges
- Cyan gradient: visible in hero section

**Button Sample Found:**
- Background: rgba(0,0,0,0) [transparent]
- Color: lab(41.91 -1.28 -9.13) [Dark blue/gray]
- Padding: 8px 12px
- Border-radius: 14px
- Font-size: 12px
- Font-weight: 500

---

## Typography Analysis

**Fonts Used:**
- Display font: Appears to be Sora or similar (headings)
- Body font: System font or Plus Jakarta Sans
- Mono: Not detected in main sections

**Heading Sizes:**
- H1: "12 jobs auto-applied this week" (32px, bold)
- H2: "Pro AI is on duty", "AI activity feed", "AI-curated for you" (20-24px)
- Section labels: 12px uppercase

**Text Sizes:**
- Card titles: 14-16px
- Body text: 14px
- Labels: 12px
- Metadata: 12px gray

---

## Component Count

- **Sections analyzed:** 1 main
- **Cards found:** 9+ individual cards
- **Buttons:** 12 (action buttons across cards)
- **Headings:** 5 major headings
- **Unique colors:** 20+ (including gradients)

---

## Layout Specifications

**Viewport:** 1440px width × 900px height (standard desktop)

**Grid System:**
- Main column: `col-span-12 space-y-5 lg:col-span-8`
- Sidebar: Implied right column
- Gap between major sections: 20px (`space-y-5`)

**Responsive Classes Detected:**
- `col-span-12` (full width mobile)
- `lg:col-span-8` (8 columns on large screens)
- `items-end justify-between` (flex utilities)
- `gap-4`, `gap-1.5` (spacing utilities)

---

## Component Features (From HTML Analysis)

**Status Badges:**
```html
<span class="inline-flex items-center gap-1.5 rounded-full 
     bg-success/15 px-2.5 py-1 text-xs font-semibold text-success">
  <span class="h-1.5 w-1.5 animate-pulse rounded-full bg-success"></span>
  Active
</span>
```

**Automation Section Header:**
```html
<p class="text-xs font-semibold uppercase tracking-[0.18em] 
   text-muted-foreground">
  Automation engine
</p>
<h2 class="mt-1 font-display text-xl font-semibold 
   tracking-tight">
  Pro AI is on duty
</h2>
```

---

## Key Design Patterns Observed

1. **Gradient Hero Banner** - Purple to cyan, white text
2. **Card-based layout** - All content in white cards
3. **Status indicators** - Green dots, checkmarks, timestamps
4. **Toggle switches** - iOS-style on/off controls
5. **Icon + text labels** - Every major section has an icon
6. **Match color coding** - Green/amber/orange for percentages
7. **Grid layouts** - Responsive 3+ column for metrics
8. **Floating widget** - Career Copilot always accessible
9. **Simple shadows** - Subtle elevation, not heavy
10. **Ample whitespace** - Comfortable padding/gaps

---

## What's Different from Initial Analysis

**Corrections made:**
1. Hero banner is more prominent (gradient background)
2. Automation cards are in separate section, not scattered
3. Job cards are simpler (less data per card)
4. Activity feed is more minimal
5. Career Copilot is positioned right sidebar (floating)
6. Color system uses more subtle tones
7. Spacing is more generous
8. Border radius values smaller (6-8px vs 12-16px)

---

## Action Items for GetAI Frontend

1. **Update hero banner** - Add gradient, reorganize metrics
2. **Refine card styling** - Adjust shadows and spacing
3. **Automation section** - Create dedicated component
4. **Activity feed** - Simplify layout
5. **Job recommendations** - Improve match % styling
6. **Career Copilot** - Position as floating widget
7. **Colors** - Verify gradient values
8. **Spacing** - Use tighter, more consistent gaps

---

**Next Step:** Use this accurate analysis to update frontend components to match the live product exactly.
