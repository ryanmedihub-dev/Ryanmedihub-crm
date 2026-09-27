

export const BACK_DATE_PRIVILEGED_ROLES = ["admin", "super-admin"];

function todayStartUTC() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export function isBackDated(date) {
  if (!date) return false;
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return false;
  d.setUTCHours(0, 0, 0, 0);
  return d < todayStartUTC();
}

export function backDateGuard(role, ...dates) {
  if (BACK_DATE_PRIVILEGED_ROLES.includes(role)) return null;
  if (!dates.some((d) => isBackDated(d))) return null;
  return {
    status: 403,
    body: {
      success: false,
      message:
        "Back-dated transactions can only be created, edited, or deleted by an admin.",
      error:
        "Back-dated transactions can only be created, edited, or deleted by an admin.",
    },
  };
}
