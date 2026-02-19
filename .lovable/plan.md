

# BeatGenius Ultra — Phase 1: Core Platform

## Visual Identity & Layout
- **OLED dark theme** with Electric Blue (#00D1FF) and Cyber Lime (#CCFF00) accents
- Clean sans-serif typography (Inter)
- Split-panel layout: **Generator Dashboard** (left) and **My Beat Library** (right)
- Mobile-first responsive design — panels stack vertically on small screens
- Lucide-React icons throughout

## Authentication
- Email/password sign-up and login via Supabase Auth
- User profiles table for storing display name and producer tag
- Protected routes — must be logged in to access the app

## Generator Dashboard (Left Panel)
- **Text input** for "Musical Vision" prompt
- **Genre dropdown**: Trap, Drill, Afro-Trap, Rage
- **Energy Level slider** (1–10)
- **Instrumental Density slider** (1–10)
- **BPM input** with validation (60–200 range)
- **"Generate Beat" button** with animated loading state (pulse/glow effect in Electric Blue)
- Skeleton loaders during generation
- Validation: prevent empty prompts, out-of-range BPM
- "Try Again" button on failure

## Audio Engine (wavesurfer.js)
- Waveform visualizer displaying the generated beat
- Play/Pause, Seek (click waveform), and Volume controls
- Styled to match the dark theme with accent-colored waveform

## Beat Generation (Suno API via Edge Function)
- Supabase edge function proxying requests to the Suno API
- Stores generated audio files in Supabase Storage
- Saves beat metadata (title, genre, BPM, energy, density, prompt) to database

## My Beat Library (Right Panel)
- List/grid of user's previously generated beats
- Each beat card shows: title, genre, BPM, date, play button
- Click to load beat into the audio engine
- Delete beats

## Database Schema
- `profiles` table (user display name, producer tag)
- `beats` table (metadata: title, genre, BPM, energy, density, prompt, audio file URL, user ID, timestamps)

---

*Phase 2 (future iteration): Copyright Shield with License IDs & PDF generation, ID3 metadata injection, social media 30s preview export*

