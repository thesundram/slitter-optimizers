import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import clientPromise from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import bcrypt from 'bcryptjs';

export async function PUT(req, { params }) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session || session.user?.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const data = await req.json();
  const client = await clientPromise;
  const db = client.db('slitter-optimizers');

  const updateData: any = {
    username: data.username,
    role: data.role || 'user',
  };

  if (data.password) {
    updateData.password = await bcrypt.hash(data.password, 10);
  }

  if (data.role !== 'admin' && data.expiryDate) {
    updateData.expiryDate = data.expiryDate;
  } else if (data.role === 'admin') {
    updateData.$unset = { expiryDate: '' };
  }

  if (data.companyName) {
    updateData.companyName = data.companyName;
  }

  await db.collection('users').updateOne(
    { _id: new ObjectId(id) },
    { $set: updateData }
  );

  return NextResponse.json({ success: true });
}

export async function DELETE(req, { params }) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session || session.user?.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const client = await clientPromise;
  const db = client.db('slitter-optimizers');

  await db.collection('users').deleteOne({ _id: new ObjectId(id) });
  return NextResponse.json({ success: true });
}
