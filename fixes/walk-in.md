# Bug Report: Walk-in Appointment Type Causes Generic Error

## Screenshot Context

**Screen:** New Appointment modal (`Schedule a patient visit`)  
**Error message shown:** `⚠ An error occurred. Please check and try again.`  
**Trigger:** Selecting the **Walk-in** appointment type (3rd button in the appointment type row)  
**Other fields at time of error:**
- Patient: solly (+201010001444)
- Doctor: Dr. Ahmed Hassan — Cardiology
- Date: 05/13/2026 | Time: 06:00 PM | Duration: 20 min
- Patient Source: VEZ
- Session Fee: EGP 800
- No extra services selected

The error appears immediately or on form submission when Walk-in is selected. In-Person and Online do not trigger it.

---

## Claude Code Investigation Prompt

```
You are debugging a bug in the FCMS (Fadl Clinic Management System) project.

## Bug Description
When a user selects "Walk-in" as the appointment type in the New Appointment modal,
a generic error "An error occurred. Please check and try again." is displayed.
This does NOT happen with "In Person" or "Online" appointment types.

## What I need you to do

### Step 1 — Find the appointment type enum/constants
Search for how appointment types are defined:
- Look for enums, constants, or type definitions related to: `walk_in`, `walkin`, `WALK_IN`, `walk-in`, `appointmentType`
- Check: `src/`, `services/`, `types/`, `shared/`, `constants/` directories
- Command: grep -r "walk" --include="*.ts" --include="*.tsx" -l

### Step 2 — Find the appointment creation service/API call
- Find the function that handles form submission for new appointments
- Look for: `createAppointment`, `bookAppointment`, `scheduleAppointment`, or similar
- Check the API payload being sent — what value is being sent for `appointmentType` or `type` when Walk-in is selected?
- Command: grep -r "appointmentType\|appointment_type\|walk" --include="*.ts" --include="*.tsx" -n

### Step 3 — Check backend validation
- Find the appointment controller/route handler
- Check if Walk-in is included in the allowed/accepted values for appointment type
- Look for Zod schemas, Joi validation, class-validator decorators, or if-else/switch blocks that handle appointment types
- Command: grep -r "walk\|appointmentType\|appointment_type" --include="*.ts" -n src/

### Step 4 — Check frontend Walk-in button value
- Find the component rendering the 3 appointment type buttons (In Person, Online, Walk-in)
- Confirm what value is passed when Walk-in is clicked
- Check if the value matches exactly what the backend expects (case-sensitive, snake_case vs camelCase, etc.)

### Step 5 — Check error handling
- Find where the generic error message "An error occurred. Please check and try again." is set
- Is the actual backend error being swallowed/hidden? Log the raw error to console temporarily
- Check: catch blocks, error boundaries, axios/fetch interceptors

### Step 6 — Fix and verify
Based on your findings, apply the fix. Common root causes to check:
1. Walk-in value mismatch between frontend and backend (e.g. frontend sends "walk-in", backend expects "WALK_IN")
2. Walk-in is missing from backend enum/validation schema entirely
3. Walk-in requires additional required fields that aren't being sent (e.g. `queueNumber`, `walkInTime`)
4. Database schema doesn't include Walk-in as a valid appointment type value
5. Walk-in fee handling is different and causing a null/undefined error

After fixing, run the dev server and confirm the appointment books successfully with Walk-in type.

## Project context
- Stack: Fastify + TypeScript (backend microservices), Next.js 13 (frontend), PostgreSQL (database)
- This is a clinic management system (FCMS)
- The appointment service is one of 13 microservices

## Commands to run first
```bash
# Find all files mentioning walk-in
grep -r -i "walk" --include="*.ts" --include="*.tsx" -l .

# Find appointment type definitions
grep -r -i "appointmentType\|appointment_type" --include="*.ts" -n . | head -40

# Check recent errors in running services
docker compose logs appointment-service --tail=50 2>/dev/null || \
  kubectl logs deploy/appointment-service --tail=50 2>/dev/null
```

Start with Step 1 and work through each step. Show me what you find before applying the fix.
```

---

## Screenshot Description (for `.md` image reference)

**File:** `docs/bugs/walkin-error-screenshot.png`  
**What it shows:**

The New Appointment modal in dark theme with a red error banner at the top.
The modal has 4 sections: Patient (solly), Doctor (Dr. Ahmed Hassan - Cardiology),
Schedule (05/13/2026 at 06:00 PM, 20 min), and Details.
In the Details section, the Walk-in button (3rd of 3 appointment type buttons) is
highlighted in red/active state. The Patient Source "VEZ" is selected.
Session fee is EGP 800. The red error banner reads:
"⚠ An error occurred. Please check and try again."
The Confirm Booking button is visible at the bottom but the booking failed.
