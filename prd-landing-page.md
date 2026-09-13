# PRD: BracketWay Landing Page (Static)

## Purpose

A fully static single-page landing site that explains the BracketWay project — a sandwich-making robot powered by a pi0.5 VLA — and showcases the workflow, results, and learnings. No live data, no WebSocket connections, no backend required. Deployable to any static host (Vercel, GitHub Pages, etc.).

## Target Audience

- Hackathon judges and attendees
- Robotics / ML enthusiasts visiting the project link
- Anyone who scans a QR code at the demo table

## Page Structure

### 1. Hero Section

- Project title: **BracketWay**
- Tagline: one-liner capturing "voice-activated sandwich-making robot"
- Short description: BracketBot (self-balancing, 2x 7-DOF arms) makes a sandwich via multi-step VLA-driven task pipeline
- Background: CSS gradient or animated geometric pattern (no video dependency)

### 2. Workflow / How It Works

Step-by-step visual breakdown of the sandwich pipeline:

| Step | Method | Description |
|------|--------|-------------|
| 1. Pull down toaster knob | VLA (pi0.5) | Trained policy actuates the toaster lever |
| 2. Take bread out of toaster + place on plate | VLA (pi0.5) | Trained policy picks bread and places it |
| 3. Put mayo on bread | VLA (pi0.5) | Trained policy applies condiment |
| 4. Move lettuce pieces onto bread | Non-VLA (IK) | Inverse kinematics for structured pick-and-place |

Each step rendered as a card with:
- Step number
- Icon (CSS/SVG)
- VLA or IK badge
- Brief caption

### 3. Training & Approach

Static stats and infographic:
- **Model**: pi0.5 Vision-Language-Action model
- **Data**: ~50 episodes per task
- **Training time**: <1 hour per task, enabling rapid multi-task training
- **Data collection**: Episodes collected with home-position resets between runs
- Visual: static diagram of the train-deploy loop (collect data -> train -> deploy -> repeat)

### 4. Architecture Overview

Static diagram showing system components:
- BracketBot hardware (2x 7-DOF arms, depth+RGB camera)
- Server (task sequencer, WebSocket)
- Web dashboard
- iPhone localization
- Rendered as an SVG or CSS diagram

### 5. Reflections

Two-column layout:

**What went well**
- Training time was <1 hour, allowing multiple tasks to be trained quickly
- Home-position reset workflow made data collection efficient

**What could've been better**
- Autonomous navigation + mapping (SLAM or lightweight nav as future direction)

### 6. Footer

- Team name: BracketWay
- GitHub repo link (placeholder)
- Tech stack badges: pi0.5, Next.js, Three.js, WebSocket

## Design Direction

- Dark theme (dark background, light text, accent colors for badges/cards)
- Clean, scroll-driven layout — single page, no routing
- Responsive: laptop and mobile friendly
- Minimal text — let visuals and the step-by-step cards carry the story
- CSS animations: subtle fade-in on scroll using Intersection Observer

## Technical Approach

- Standalone Next.js project in `landing/` directory
- Tailwind CSS v4 for styling
- Fully static — `output: 'export'` in next.config for static HTML export
- No external API calls, no WebSocket, no live data
- All content hardcoded in components
- CSS/SVG only for visuals (no Three.js, no heavy 3D dependencies)

## Out of Scope

- Live robot data or camera feeds
- 3D scene rendering
- User auth, CMS, or dynamic content
- Backend or API routes
