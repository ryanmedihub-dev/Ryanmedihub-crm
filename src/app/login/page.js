'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, AlertCircle } from 'lucide-react';
import { Button, Field, Input } from '@/components/ui';

export default function LoginPage() {
  const router = useRouter();

  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const result = await signIn('credentials', {
        email: formData.email,
        password: formData.password,
        redirect: false,
      });

      if (result?.error) {
        setError(result.error);
        setLoading(false);
        return;
      }

      if (result?.ok) {
        const response = await fetch('/api/auth/session');
        const session = await response.json();

        const roleRoutes = {
          owner: '/owner/dashboard',
          'super-admin': '/super-admin/dashboard',
          admin: '/admin/dashboard',
          sales: '/sales/dashboard',
          counsellor: '/counsellor/patients',
          reception: '/reception/dashboard',
          collab: '/collab/dashboard',
          surgery: '/surgery/dashboard',
          stock: '/stocks/dashboard',
          hr: '/hr/dashboard',
        };

        router.push(roleRoutes[session?.user?.role] || '/');
        router.refresh();
      }
    } catch (err) {
      setError('Something went wrong. Please try again.');
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

          <h1 className="text-xl font-semibold tracking-tight text-gray-900">Sign in to your account</h1>
          <p className="text-sm text-gray-500 mt-1">Your session stays active for 9 hours.</p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            {error && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-lg bg-rose-50 border border-rose-200 px-3 py-2.5 text-sm text-rose-700"
              >
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden />
                <span>{error}</span>
              </div>
            )}

            <Field label="Email" htmlFor="email">
              <Input
                id="email"
                type="email"
                name="email"
                autoComplete="email"
                required
                autoFocus
                value={formData.email}
                onChange={handleChange}
                disabled={loading}
                placeholder="you@clinic.com"
                invalid={!!error}
              />
            </Field>

            <Field label="Password" htmlFor="password">
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  autoComplete="current-password"
                  required
                  value={formData.password}
                  onChange={handleChange}
                  disabled={loading}
                  invalid={!!error}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                  className="absolute right-1 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </Field>

            <Button type="submit" variant="primary" size="lg" loading={loading} className="w-full justify-center !mt-6">
              {loading ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
        </div>
      </main>
      <footer className="py-6 text-center text-xs text-gray-400">© {new Date().getFullYear()} RyanCRM</footer>
    </div>
  );
}
