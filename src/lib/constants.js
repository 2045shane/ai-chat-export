/** Bulk tasks allowed per local calendar day. Exporting the open chat is not counted. */
export const FREE_DAILY_BULK_LIMIT = 3;

/**
 * Real checkout stays off. Do not attach a payment URL when this is false.
 * Price and code delivery are intentionally undecided.
 */
export const BUYOUT_CHECKOUT_ENABLED = false;

/** Local placeholder. This is not a receipt and unlocks nothing outside this browser profile. */
export const BUYOUT_STUB_CODE = 'ACE-LOCAL-0001';

export const STORAGE_LICENSE = 'buyoutCode';
export const STORAGE_USAGE = 'bulkUsage';
export const STORAGE_JOB = 'bulkJob';
