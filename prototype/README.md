# Wellspring Maintenance Prototype

An interactive prototype of one complete Wellspring workflow: a maintenance problem goes from report to resolution.

**Live prototype:** https://elieboss.github.io/wellspringdatabase/

Built with React and Tailwind CSS. It uses the sample data from `database/wellspring.sql` (the same rooms, people, vendors and requests). Nothing is sent anywhere: the data lives in your browser, and **Open the prototype guide → Reset the prototype** starts over.

## The workflow

| Screen | Used by | What it shows | Error and recovery |
|---|---|---|---|
| **R1** Reporter home | Reporter (staff, volunteers, board) | Starting point. Primary action: **Report a problem**. Lists the reporter's own reports. | — |
| **R2** Report form | Reporter | Enter title, room, kind of problem, urgency and description. | Continue with fields missing: an error summary links to each field, and each field shows what to fix. Errors clear as they are fixed. |
| **R3** Review and send | Reporter | Review every answer before sending. Warns if the room already has open reports. | The first Send fails ("connection dropped"). The answers are kept; **Try again** sends them. |
| **R4** Report sent | Reporter | Confirmation with the report number and what happens next. | — |
| **S1** Staff sign-in | Facilities staff only | Only Staff accounts can open the queue. | Choosing a Volunteer or Board account is refused, with a way back to reporting. |
| **S2** Maintenance queue | Facilities staff only | All reports, most urgent first, filtered by status, room or "only mine". The new report is marked **New**. | — |
| **S3** Request detail | Facilities staff only | Assign the request, book a vendor, record the finished job and its cost, resolve, add notes. Full history. | Saving "Assigned" with nobody chosen → **Assign to me**. Resolving while the vendor job is unfinished → **Record the finished job**. A negative cost or a finish date before the visit date is refused. |
| **R5** Track my report | Reporter | The reporter sees the updated status, who handled it, and the full history. | — |

The staff rules match the database's business rules: assign before moving past Reported (Rule 2), status only moves forward (Rule 3), every vendor job finished before resolving (Rule 4), no negative costs (Rule 10), and only active vendors can be booked (Rule 9).

## Suggested walkthrough

1. **R1** Press **Report a problem**.
2. **R2** Press **Continue to review** with the form empty to see the errors, then fill it in.
3. **R3** Press **Send report**. It fails once; press **Try again**.
4. **R4** Note the report number, then choose **Staff queue** at the top.
5. **S1** Try **Priya Shah** (refused), then sign in as **Marcus Hill**.
6. **S2** Open the report marked **New**.
7. **S3** Press **Save status** with nobody assigned (error), then **Assign to me** and save. Book a vendor, move it to In Progress, try to resolve (blocked), record the finished job, and resolve.
8. **See what the reporter sees** opens **R5** with the report marked Fixed.

## Run it locally

```bash
cd prototype
npm install
npm run dev        # http://localhost:5173
```

`npm run build` writes the site to `prototype/dist/`. The live site is that folder, published on the repository's `gh-pages` branch.
