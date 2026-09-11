// Where each role lands after login / when bounced off a panel it can't see.
export const ROLE_ROUTES = {
  owner: "/owner/dashboard",
  "super-admin": "/super-admin/dashboard",
  admin: "/admin/dashboard",
  sales: "/sales/dashboard",
  counsellor: "/counsellor/patients",
  reception: "/reception/dashboard",
  collab: "/collab/dashboard",
  surgery: "/surgery/dashboard",
  stock: "/stocks/dashboard",
  hr: "/hr/dashboard",
};

export function roleHome(role) {
  return ROLE_ROUTES[role] || "/login";
}
