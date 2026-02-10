# The 147 - Venue App

## Overview
Mobile app for The 147 (www.the147.co.uk) - a snooker venue, bar, and restaurant. Built with Expo React Native + Express backend.

## Features
- **Home**: Hero branding, quick actions, featured events, today's hours
- **Book a Table**: Date picker, table type (snooker/pool/dining/VIP), party size, time slot, booking confirmation
- **Events / What's On**: Event listings with filters, event details modal, ticket purchasing flow
- **About**: Venue info, facilities grid, opening hours, contact/social links

## Architecture
- Frontend: Expo Router with tab navigation (4 tabs: Home, Book, Events, About)
- Backend: Express on port 5000 (landing page + API)
- State: Local state only (no database needed for current features)
- Font: Montserrat (Google Fonts)
- Colors: Brand blue (#0047AB), red (#DF3131), gold (#D4A843), dark navy (#0A1628)

## Project Structure
- `app/(tabs)/` - Tab screens (index, book, events, about)
- `lib/data.ts` - Static data (events, table types, time slots, opening hours)
- `constants/colors.ts` - Theme colors
- `attached_assets/` - Logo and branding assets

## Recent Changes
- Feb 2026: Initial build with all 4 tabs, booking flow, events/tickets, about page
