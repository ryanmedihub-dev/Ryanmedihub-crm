'use client';

import { useState } from 'react';

export default function AdminResetPasswordForm({ users }) {
  const [selectedUserId, setSelectedUserId] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    if (!selectedUserId) {
      setError('Please select a user');
      setLoading(false);
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      setLoading(false);
      return;
    }

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters');
      setLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/admin/reset-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: selectedUserId,
          newPassword: newPassword,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.message || 'Failed to reset password');
        setLoading(false);
        return;
      }

      setSuccess(data.message);

      setSelectedUserId('');
      setNewPassword('');
      setConfirmPassword('');
      setLoading(false);

    } catch (error) {
      console.error('Reset password error:', error);
      setError('An unexpected error occurred');
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6 bg-white rounded-lg shadow">
      <h2 className="text-xl font-semibold tracking-tight mb-6 text-gray-900">Reset User Password</h2>

      <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded">
        <p className="text-sm text-red-800">
          ⚠️ <strong>Warning:</strong> Resetting a user's password will immediately log them out
          from ALL devices. They will need to use the new password to log in again.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {success && (
          <div className="p-4 bg-green-50 border border-green-200 rounded">
            <p className="text-sm text-green-800">{success}</p>
          </div>
        )}

        <div>
          <label htmlFor="user" className="block text-sm font-medium text-gray-700 mb-2">
            Select User
          </label>
          <select
            id="user"
            value={selectedUserId}
            onChange={(e) => {
              setSelectedUserId(e.target.value);
              setError('');
              setSuccess('');
            }}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
            disabled={loading}
            required
          >
            <option value="">-- Select a user --</option>
            {users?.map((user) => (
              <option key={user._id} value={user._id}>
                {user.name} ({user.email}) - {user.role}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700 mb-2">
            New Password
          </label>
          <input
            type="password"
            id="newPassword"
            value={newPassword}
            onChange={(e) => {
              setNewPassword(e.target.value);
              setError('');
              setSuccess('');
            }}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
            disabled={loading}
            required
            minLength={6}
          />
          <p className="text-xs text-gray-500 mt-1">Minimum 6 characters</p>
        </div>

        <div>
          <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-2">
            Confirm New Password
          </label>
          <input
            type="password"
            id="confirmPassword"
            value={confirmPassword}
            onChange={(e) => {
              setConfirmPassword(e.target.value);
              setError('');
              setSuccess('');
            }}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
            disabled={loading}
            required
            minLength={6}
          />
        </div>

        <div className="flex items-center justify-between pt-4">
          <button
            type="button"
            onClick={() => {
              setSelectedUserId('');
              setNewPassword('');
              setConfirmPassword('');
              setError('');
              setSuccess('');
            }}
            className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
            disabled={loading}
          >
            Clear
          </button>

          <button
            type="submit"
            disabled={loading}
            className="px-6 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Resetting Password...' : 'Reset Password'}
          </button>
        </div>
      </form>

      <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded">
        <h3 className="text-sm font-semibold text-blue-900 mb-2">How it works:</h3>
        <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
          <li>Password is immediately changed in the database</li>
          <li>User's session version is incremented</li>
          <li>All existing sessions become invalid</li>
          <li>User is logged out from all devices</li>
          <li>User must login with new password</li>
        </ul>
      </div>
    </div>
  );
}