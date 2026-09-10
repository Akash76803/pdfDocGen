# DB-4.3A Fix5 — Date / Date Time / Time Formatting

## Why this fix exists
Manual QA failed DB4-T43. The formatter previously delegated most strings to JavaScript `Date`, which can reject `DD/MM/YYYY` values and can shift ISO/Excel-normalized datetimes into the machine timezone.

## Fix
- Preserve literal ISO date/time components instead of timezone-converting document values.
- Support ISO date, ISO datetime, DD/MM/YYYY, MM/DD/YYYY when unambiguous, optional time, and time-only values.
- Support legacy Excel serial date/time numbers when the user explicitly chooses a date/time data type.
- Date-only values never shift to the previous/next day because of timezone conversion.
- Date Time and Time honor 12-hour / 24-hour display without changing source data.

## Manual acceptance
1. `2026-09-10` → `10/09/2026`, `09/10/2026`, `2026-09-10`, or `10 Sep 2026` according to the selected format.
2. `10/09/2026` must parse as 10 September 2026.
3. `2026-09-10T14:35:00.000Z` must display the source wall-clock time as `02:35 PM` or `14:35`, not shift by the computer timezone.
4. Excel date/datetime cells must keep their workbook date/time meaning.
5. Save/reload must preserve type and format configuration.
