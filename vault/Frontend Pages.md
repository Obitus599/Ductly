# Frontend Pages

All pages use Next.js 14 App Router with Tailwind CSS.

## Public Pages

### / (Landing Page)
**File**: `src/app/page.tsx`
Placeholder landing page.

### /book (Booking Flow)
**File**: `src/app/book/page.tsx`
**Layout**: `src/app/book/layout.tsx` (includes [[Header]])

3-step client-side flow:
1. **Date** - date picker (min: tomorrow), "Check Availability" button → [[slots-route|GET /api/slots]]
2. **Slot** - grid of available times, click → [[booking-locks|POST /api/booking-locks]] (acquires 10-min lock)
3. **Details** - form (name, email, phone, address, property type, bedrooms) + price summary + lock countdown timer → [[checkout-route|POST /api/checkout]] → Stripe redirect

Key behaviors:
- All timestamps use `+04:00` UAE offset
- Lock countdown with auto-expire + "Change time" releases lock via DELETE
- Double-click guard on checkout button
- Villa/apartment bedroom reset logic

### /book/success
**File**: `src/app/book/success/page.tsx`
Post-payment confirmation with green checkmark.

## Admin Pages

### /admin (Dashboard)
**File**: `src/app/admin/page.tsx`
**Layout**: `src/app/admin/layout.tsx` (dark nav with links)

Stat cards: today's bookings, pending, confirmed, active teams. Recent bookings list. Team workloads.

### /admin/bookings
**File**: `src/app/admin/bookings/page.tsx`
Filterable paginated bookings table with status and date filters.

### /admin/teams
**File**: `src/app/admin/teams/page.tsx`
Team management cards: schedules, workload, activate/deactivate toggle.

## Components

### Header
**File**: `src/components/Header.tsx`
Shared header with "Book Now" link.

#frontend #codebase
