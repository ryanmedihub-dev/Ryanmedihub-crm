'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button, Field, Input, Select } from '@/components/ui';

export default function Register() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    role: 'reception'
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      setLoading(false);
      return;
    }

    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters long');
      setLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          password: formData.password,
          role: formData.role
        }),
      });

      const data = await response.json();

      if (response.ok) {
        router.push('/login?message=Registration successful');
      } else {
        setError(data.error || 'Registration failed');
      }
    } catch (error) {
      setError('An error occurred during registration');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <main className="flex-1 min-w-0 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm animate-fade-in">
          <div className="flex items-center gap-2.5 mb-10">
            <span className="w-8 h-8 rounded-lg bg-gray-900 text-white flex items-center justify-center text-sm font-semibold">
              R
            </span>
            <span className="text-sm font-semibold text-gray-900">RyanCRM</span>
          </div>

          <h1 className="text-xl font-semibold tracking-tight text-gray-900">Create your account</h1>
          <p className="mt-1 text-sm text-gray-500">
            Already have one?{' '}
            <Link href="/login" className="font-medium text-indigo-600 hover:text-indigo-700 underline-offset-2 hover:underline">
              Sign in
            </Link>
          </p>

          <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
            {error && (
              <div role="alert" className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2.5 text-sm text-rose-700">
                {error}
              </div>
            )}

            <Field label="Full name" htmlFor="name">
              <Input id="name" name="name" type="text" autoComplete="name" required value={formData.name} onChange={handleChange} />
            </Field>

            <Field label="Email" htmlFor="email">
              <Input id="email" name="email" type="email" autoComplete="email" required value={formData.email} onChange={handleChange} placeholder="you@clinic.com" />
            </Field>

            <Field label="Role" htmlFor="role">
              <Select id="role" name="role" value={formData.role} onChange={handleChange}>
                <option value="reception">Reception</option>
                <option value="admin">Admin</option>
                <option value="sales">Sales</option>
                <option value="surgery">Surgery</option>
              </Select>
            </Field>

            <Field label="Password" htmlFor="password">
              <Input id="password" name="password" type="password" autoComplete="new-password" required value={formData.password} onChange={handleChange} />
            </Field>

            <Field label="Confirm password" htmlFor="confirmPassword">
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
                value={formData.confirmPassword}
                onChange={handleChange}
              />
            </Field>

            <Button type="submit" variant="primary" size="lg" loading={loading} className="w-full justify-center !mt-6">
              {loading ? 'Creating account…' : 'Create account'}
            </Button>
          </form>
        </div>
      </main>
    </div>
  );
}
