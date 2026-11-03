import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import dbConnect from '@/lib/db';
import User from '@/models/User';
import { MAIN_BRANCHES } from '@/lib/branches';

// Roles that may be created via this endpoint.
// 'owner' is intentionally excluded — owner accounts are provisioned
// directly in the database by the system administrator.
const ALLOWED_ROLES = [
  'super-admin', 'admin', 'sales', 'reception',
  'collab', 'surgery', 'counsellor', 'stock', 'hr',
];

const VALID_BRANCHES = ['All', 'Collab', ...MAIN_BRANCHES];

export async function POST(request) {
  try {
    // ── Authorization ────────────────────────────────────────────────────────
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== 'super-admin') {
      return NextResponse.json(
        { error: 'Unauthorized. Super-admin access required.' },
        { status: 403 }
      );
    }
    // ────────────────────────────────────────────────────────────────────────

    const { name, email, password, role, branch } = await request.json();

    if (!name || !email || !password || !role) {
      return NextResponse.json(
        { error: 'Name, email, password, and role are required' },
        { status: 400 }
      );
    }

    // ── Server-side role validation (never trust client-supplied role) ───────
    if (!ALLOWED_ROLES.includes(role)) {
      return NextResponse.json(
        { error: `Invalid role. Allowed roles: ${ALLOWED_ROLES.join(', ')}` },
        { status: 400 }
      );
    }
    // ────────────────────────────────────────────────────────────────────────

    if (branch && !VALID_BRANCHES.includes(branch)) {
      return NextResponse.json(
        { error: `Invalid branch. Must be one of: ${VALID_BRANCHES.join(', ')}` },
        { status: 400 }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: 'Invalid email format' }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters' },
        { status: 400 }
      );
    }

    await dbConnect();

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return NextResponse.json(
        { error: 'User with this email already exists' },
        { status: 400 }
      );
    }

    const user = await User.create({
      name,
      email: email.toLowerCase(),
      password,
      role,
      branch: branch || 'All',
      sessionVersion: 0,
    });

    console.log(`Super-admin ${session.user.email} created user: ${user.email} (${user.role})`);

    return NextResponse.json(
      {
        message: 'User created successfully',
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          branch: user.branch,
          createdAt: user.createdAt,
        },
      },
      { status: 201 }
    );

  } catch (error) {
    console.error('Registration error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}