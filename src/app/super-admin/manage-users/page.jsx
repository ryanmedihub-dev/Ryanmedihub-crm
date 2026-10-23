"use client";

import { useState, useEffect } from "react";
import { Crown, Plus, Search, Shield, Trash2, Edit3, X, Eye, EyeOff } from "lucide-react";
import SuperAdminSidebar from "@/components/Sidebars/SuperAdminSidebar";

const ALL_ROLES = ["super-admin", "admin", "sales", "reception", "collab", "surgery", "counsellor", "stock", "hr"];
const BRANCHES = ["Delhi", "Mumbai", "Hyderabad", "Noida", "Gurgaon", "Collab", "All"];

const ROLE_COLOR = {
  "super-admin": "bg-amber-100 text-amber-700 border-amber-200",
  admin:         "bg-red-100 text-red-700 border-red-200",
  sales:         "bg-green-100 text-green-700 border-green-200",
  reception:     "bg-blue-100 text-blue-700 border-blue-200",
  collab:        "bg-cyan-100 text-cyan-700 border-cyan-200",
  surgery:       "bg-pink-100 text-pink-700 border-pink-200",
  counsellor:    "bg-purple-100 text-purple-700 border-purple-200",
  stock:         "bg-orange-100 text-orange-700 border-orange-200",
  hr:            "bg-teal-100 text-teal-700 border-teal-200",
};

function UserModal({ user, onClose, onSuccess }) {
  const isEdit = !!user;
  const [form, setForm] = useState({
    name:     user?.name     || "",
    email:    user?.email    || "",
    role:     user?.role     || "reception",
    branch:   user?.branch   || "All",
    password: "",
  });
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleChange = (e) => {
    setForm((p) => ({ ...p, [e.target.name]: e.target.value }));
    setError("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const body = isEdit
        ? { userId: user._id, ...form }
        : form;
      const url = isEdit
        ? "/api/admin/users/update-user"
        : "/api/admin/users/create-user";
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) {
        onSuccess(data.message);
        onClose();
      } else {
        setError(data.message || "An error occurred");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">{isEdit ? "Edit User" : "Create New User"}</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
            <input
              name="name" value={form.name} onChange={handleChange} required
              placeholder="Full name"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
            <input
              name="email" type="email" value={form.email} onChange={handleChange} required
              placeholder="user@example.com"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Role *</label>
              <select
                name="role" value={form.role} onChange={handleChange} required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                {ALL_ROLES.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Branch</label>
              <select
                name="branch" value={form.branch} onChange={handleChange}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                {BRANCHES.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Password {isEdit ? "(leave blank to keep current)" : "*"}
            </label>
            <div className="relative">
              <input
                name="password" type={showPwd ? "text" : "password"}
                value={form.password} onChange={handleChange}
                required={!isEdit}
                placeholder={isEdit ? "••••••••" : "Min. 6 characters"}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              <button
                type="button" onClick={() => setShowPwd((p) => !p)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button" onClick={onClose}
              className="flex-1 border border-gray-300 text-gray-700 rounded-lg py-2.5 text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit" disabled={loading}
              className="flex-1 bg-amber-500 hover:bg-amber-600 text-white rounded-lg py-2.5 text-sm font-medium transition-colors disabled:opacity-60"
            >
              {loading ? "Saving…" : isEdit ? "Save Changes" : "Create User"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function SuperAdminManageUsers() {
  const [users, setUsers] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [branchFilter, setBranchFilter] = useState("all");
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState({ type: "", text: "" });

  const showToast = (type, text) => {
    setToast({ type, text });
    setTimeout(() => setToast({ type: "", text: "" }), 5000);
  };

  const fetchUsers = async () => {
    try {
      const res = await fetch("/api/admin/users");
      const data = await res.json();
      if (data.success) {
        setUsers(data.users);
        setFiltered(data.users);
      }
    } catch {  } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); }, []);

  useEffect(() => {
    let result = users;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
      );
    }
    if (roleFilter !== "all") result = result.filter((u) => u.role === roleFilter);
    if (branchFilter !== "all") result = result.filter((u) => u.branch === branchFilter);
    setFiltered(result);
  }, [search, roleFilter, branchFilter, users]);

  const handleDelete = async (user) => {
    if (!confirm(`Delete ${user.name}? This cannot be undone.`)) return;
    try {
      const res = await fetch("/api/admin/users/delete-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user._id }),
      });
      const data = await res.json();
      if (data.success) {
        showToast("success", data.message);
        fetchUsers();
      } else {
        showToast("error", data.message);
      }
    } catch {
      showToast("error", "Failed to delete user");
    }
  };

  const roleCount = (role) => users.filter((u) => u.role === role).length;

  if (loading) {
    return (
      <section className="flex min-h-screen">
        <SuperAdminSidebar />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto" />
            <p className="mt-4 text-gray-500 text-sm">Loading users…</p>
          </div>
        </main>
      </section>
    );
  }

  return (
    <section className="flex min-h-screen bg-gray-50">
      <SuperAdminSidebar />
      <main className="flex-1 p-6 space-y-6 min-w-0">

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-linear-to-br from-amber-500 to-orange-500 flex items-center justify-center shadow">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Manage Users</h1>
              <p className="text-sm text-gray-500">Full control over all user accounts</p>
            </div>
          </div>
          <button
            onClick={() => setModal({ mode: "create" })}
            className="flex items-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-sm font-medium shadow transition-colors"
          >
            <Plus className="w-4 h-4" />
            New User
          </button>
        </div>

        {toast.text && (
          <div className={`px-4 py-3 rounded-xl text-sm font-medium ${
            toast.type === "success"
              ? "bg-green-50 border border-green-200 text-green-700"
              : "bg-red-50 border border-red-200 text-red-700"
          }`}>
            {toast.text}
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          {ALL_ROLES.map((role) => (
            <div
              key={role}
              onClick={() => setRoleFilter(roleFilter === role ? "all" : role)}
              className={`bg-white rounded-xl border p-3 text-center cursor-pointer transition-all hover:shadow-md ${
                roleFilter === role ? "ring-2 ring-amber-400 border-amber-300" : "border-gray-200"
              }`}
            >
              <p className="text-2xl font-bold text-gray-900">{roleCount(role)}</p>
              <p className={`text-xs font-medium mt-1 px-2 py-0.5 rounded-full inline-block ${ROLE_COLOR[role]}`}>
                {role}
              </p>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or email…"
                className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>
            <select
              value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}
              className="border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            >
              <option value="all">All Roles</option>
              {ALL_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            <select
              value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}
              className="border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            >
              <option value="all">All Branches</option>
              {BRANCHES.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100">
              <thead className="bg-gray-50">
                <tr>
                  {["User", "Role", "Branch", "Last Login", "Created", "Actions"].map((h) => (
                    <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-12 text-center text-gray-400 text-sm">
                      No users found
                    </td>
                  </tr>
                ) : (
                  filtered.map((u) => (
                    <tr key={u._id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-linear-to-br from-amber-400 to-orange-400 flex items-center justify-center text-white text-xs font-bold shrink-0">
                            {u.name.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-gray-900">{u.name}</p>
                            <p className="text-xs text-gray-400">{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${ROLE_COLOR[u.role] || "bg-gray-100 text-gray-700 border-gray-200"}`}>
                          {u.role}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-sm text-gray-600">{u.branch || "—"}</td>
                      <td className="px-5 py-3 text-sm text-gray-500">
                        {u.lastLogin ? new Date(u.lastLogin).toLocaleDateString("en-IN") : "Never"}
                      </td>
                      <td className="px-5 py-3 text-sm text-gray-500">
                        {u.createdAt ? new Date(u.createdAt).toLocaleDateString("en-IN") : "—"}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setModal({ mode: "edit", user: u })}
                            className="p-1.5 hover:bg-amber-50 text-amber-600 rounded-lg transition-colors"
                            title="Edit"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(u)}
                            className="p-1.5 hover:bg-red-50 text-red-500 rounded-lg transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="px-5 py-3 border-t border-gray-100 text-xs text-gray-400">
            Showing {filtered.length} of {users.length} users
          </div>
        </div>
      </main>

      {modal && (
        <UserModal
          user={modal.mode === "edit" ? modal.user : null}
          onClose={() => setModal(null)}
          onSuccess={(msg) => {
            showToast("success", msg);
            fetchUsers();
          }}
        />
      )}
    </section>
  );
}
