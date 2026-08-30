---
name: Academic Utility Core
colors:
  surface: '#f9f9ff'
  surface-dim: '#cfdaf2'
  surface-bright: '#f9f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f0f3ff'
  surface-container: '#e7eeff'
  surface-container-high: '#dee8ff'
  surface-container-highest: '#d8e3fb'
  on-surface: '#111c2d'
  on-surface-variant: '#464555'
  inverse-surface: '#263143'
  inverse-on-surface: '#ecf1ff'
  outline: '#777587'
  outline-variant: '#c7c4d8'
  surface-tint: '#4d44e3'
  primary: '#3525cd'
  on-primary: '#ffffff'
  primary-container: '#4f46e5'
  on-primary-container: '#dad7ff'
  inverse-primary: '#c3c0ff'
  secondary: '#006e2f'
  on-secondary: '#ffffff'
  secondary-container: '#6bff8f'
  on-secondary-container: '#007432'
  tertiary: '#960014'
  on-tertiary: '#ffffff'
  tertiary-container: '#bc1d25'
  on-tertiary-container: '#ffd0cc'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e2dfff'
  primary-fixed-dim: '#c3c0ff'
  on-primary-fixed: '#0f0069'
  on-primary-fixed-variant: '#3323cc'
  secondary-fixed: '#6bff8f'
  secondary-fixed-dim: '#4ae176'
  on-secondary-fixed: '#002109'
  on-secondary-fixed-variant: '#005321'
  tertiary-fixed: '#ffdad7'
  tertiary-fixed-dim: '#ffb3ad'
  on-tertiary-fixed: '#410004'
  on-tertiary-fixed-variant: '#930013'
  background: '#f9f9ff'
  on-background: '#111c2d'
  surface-variant: '#d8e3fb'
typography:
  pc-number-display:
    fontFamily: Inter
    fontSize: 48px
    fontWeight: '800'
    lineHeight: 48px
    letterSpacing: -0.02em
  pc-number-mobile:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '800'
    lineHeight: 32px
    letterSpacing: -0.02em
  h1:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
  h2:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '500'
    lineHeight: 24px
  body-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-caps:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '700'
    lineHeight: 16px
    letterSpacing: 0.05em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 4px
  touch-target: 44px
  gutter: 16px
  margin-mobile: 16px
  margin-desktop: 32px
  stack-sm: 8px
  stack-md: 16px
  stack-lg: 24px
---

## Brand & Style

This design system is built for high-utility, internal laboratory management. The brand personality is systematic, transparent, and reliable. It adopts a **Modern Corporate** style influenced by functional minimalism—prioritizing data density and legibility over decorative flair. 

The aesthetic is characterized by a "utility-first" approach: high-contrast interaction states, distinct status signaling, and a structured layout that minimizes cognitive load for students and administrators navigating the lab environment.

## Colors

The palette is engineered for immediate status recognition. 
- **Primary (Indigo):** Reserved strictly for interactive elements, primary actions, and active navigation states.
- **Success (Green):** Used for "Free" or "Available" status indicators.
- **Error (Red):** Used for "Occupied," "Maintenance," or "Alert" states.
- **Neutral/Text:** Dark slate provides high contrast against the light gray background to ensure WCAG AA accessibility.
- **Surface:** A soft off-white background reduces screen glare during long lab sessions.

## Typography

The typography system uses **Inter** for its exceptional legibility in data-heavy interfaces.
- **Display Weights:** PC numbers utilize an Extra Bold (800) weight to be visible from a distance or at a quick glance on a mobile device.
- **Hierarchy:** Use `label-caps` for metadata like "Last Active" or "GPU Model" to create a clear distinction from primary content.
- **Scale:** On mobile, the large PC display numbers scale down slightly to prevent layout breaking while maintaining their visual dominance.

## Layout & Spacing

The design system employs a **Fluid Grid** model that adapts to the specific needs of lab monitoring.

- **Mobile (Up to 768px):** Uses a 2-column grid for PC cards with 16px margins. Navigation is handled via a persistent **Bottom Navigation Bar** for easy thumb access.
- **Desktop (1024px+):** Transitions to a 4 or 5-column grid depending on screen width. Navigation shifts to a **Fixed Sidebar** on the left to maximize vertical scanning of lab rows.
- **Rhythm:** An 8px linear scale governs all padding and margins to maintain a tight, professional density.
- **Touch Targets:** All interactive elements (buttons, toggles, nav items) must maintain a minimum height/width of 44px.

## Elevation & Depth

This design system uses a **Tonal Layering** approach with minimal shadow usage to keep the interface feeling "flat" and fast.

- **Level 0 (Background):** #F8FAFC (The canvas).
- **Level 1 (Cards/Sidebar):** White (#FFFFFF) with a `shadow-sm` (0 1px 2px 0 rgba(0, 0, 0, 0.05)). This provides just enough separation to define card boundaries without looking heavy.
- **Active State:** When a card is selected or hovered, increase elevation slightly or apply a 2px solid border using the Primary Indigo color.
- **No Blurs:** Avoid glassmorphism or heavy blurs to ensure maximum performance on low-end lab terminals or mobile devices.

## Shapes

The shape language is "Soft-Modern." 
- **Cards & Containers:** Use `rounded-xl` (1.5rem/24px) for the main PC status cards to make the interface feel approachable and modern.
- **Buttons & Inputs:** Use `rounded-lg` (1rem/16px) for consistency across interactive components.
- **Status Pills:** Use fully rounded (pill) shapes for indicators like "Available" or "Busy" to distinguish them from rectangular data blocks.

## Components

### Status Cards
The core component of the system. Cards feature a large PC number in the top left, a status pill in the top right, and secondary specs (RAM, GPU) in a muted `body-sm` font at the bottom. The entire card area is a touch target.

### Buttons
- **Primary:** Solid Indigo background with white text.
- **Secondary:** White background with Indigo border (2px).
- **Ghost:** No background, Indigo text for less frequent actions.

### Navigation
- **Sidebar (Desktop):** Icons on the left, labels on the right. Active state indicated by a vertical 4px bar on the left edge and a subtle Indigo background tint.
- **Bottom Bar (Mobile):** Centered icons with labels below. Use a white background with a subtle top border (#E2E8F0).

### Input Fields
Large, accessible inputs (44px height) with a 1px border (#CBD5E1). On focus, the border thickens to 2px Indigo with a soft outer glow.

### Progress Bars
Used for displaying real-time resource usage (CPU/RAM). Use a 4px height bar with a neutral gray track and Indigo/Green/Red fills based on threshold intensity.