import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import clientPromise from '@/lib/mongodb';

export async function GET(req) {
  const session = await getServerSession(authOptions);
  if (!session || session.user?.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const client = await clientPromise;
  const db = client.db('slitter-optimizers');
  const users = await db.collection('users').find({}).toArray();
  
  return NextResponse.json(users);
}

export async function POST(req) {
  const session = await getServerSession(authOptions);
  if (!session || session.user?.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const data = await req.json();
  const client = await clientPromise;
  const db = client.db('slitter-optimizers');

  const userData = {
    username: data.username,
    password: data.password,
    role: data.role || 'user',
    createdAt: new Date().toISOString()
  };

  if (data.role !== 'admin' && data.expiryDate) {
    userData.expiryDate = data.expiryDate;
  }

  if (data.companyName) {
    userData.companyName = data.companyName;
  }

  const result = await db.collection('users').insertOne(userData);
  return NextResponse.json({ id: result.insertedId });
}
