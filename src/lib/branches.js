export const MAIN_BRANCHES = ["Delhi", "Mumbai", "Hyderabad", "Noida"];

export const COLLAB_BRANCHES = [
  "Patna",
  "Gujarat",
  "Kolkata",
  "Ahmedabad",
  "Jaipur",
  "Bengaluru",
  "Pune",
  "Lucknow",
  "Chennai",
  "Jammu",
  "Kashmir",
  "Ranchi",
  "Prayagraj",
  "Chandigarh",
  "Jalandhar",
  "Indore",
  "Bhopal",
  "Nagpur",
  "Dehradun",
];

export const ALL_BRANCHES = [...MAIN_BRANCHES, ...COLLAB_BRANCHES];

export function resolveBranchFilter(session, requestedBranch, field = "branch") {
  const userBranch = session?.user?.branch;

  if (userBranch === "Collab") {
    if (requestedBranch && COLLAB_BRANCHES.includes(requestedBranch)) {
      return { [field]: requestedBranch };
    }
    return { [field]: { $in: COLLAB_BRANCHES } };
  }

  if (userBranch && userBranch !== "All") {
    return { [field]: userBranch };
  }

  if (requestedBranch) {
    return { [field]: requestedBranch };
  }

  return {};
}
