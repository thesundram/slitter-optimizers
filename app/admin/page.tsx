'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Header } from '@/components/header';
import { Footer } from '@/components/footer';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { toast as sonnerToast } from 'sonner';
import { Pencil, Trash2, UserPlus, Eye, EyeOff } from 'lucide-react';

export default function AdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { toast } = useToast();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState(null);

  useEffect(() => {
    if (status === 'authenticated' && session?.user?.role !== 'admin') {
      router.push('/');
    }
    if (status === 'authenticated') {
      fetchUsers();
    }
  }, [status, session, router]);

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${day}-${month}-${year} ${hours}:${minutes}`;
  };

  const formatExpiryDate = (dateString) => {
    if (!dateString) return 'No Expiry';
    const [year, month, day] = dateString.split('-');
    return `${day}-${month}-${year}`;
  };

  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/users');
      const data = await res.json();
      setUsers(Array.isArray(data) ? data : []);
    } catch (error) {
      sonnerToast.error('Failed to fetch users');
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveUser = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const userData = {
      username: formData.get('username'),
      password: formData.get('password'),
      role: formData.get('role'),
      expiryDate: formData.get('expiryDate') || null,
      companyName: formData.get('companyName') || null,
    };

    try {
      const url = editUser ? `/api/users/${editUser._id}` : '/api/users';
      const method = editUser ? 'PUT' : 'POST';
      
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userData),
      });

      if (res.ok) {
        sonnerToast.success(`User ${editUser ? 'updated' : 'created'} successfully`);
        setDialogOpen(false);
        setEditUser(null);
        e.target.reset();
        fetchUsers();
      } else {
        sonnerToast.error('Failed to save user');
      }
    } catch (error) {
      sonnerToast.error('Failed to save user');
    }
  };

  const handleDelete = async () => {
    if (!userToDelete) return;
    
    try {
      const res = await fetch(`/api/users/${userToDelete}`, { method: 'DELETE' });
      if (res.ok) {
        sonnerToast.success('User deleted successfully');
        fetchUsers();
      } else {
        sonnerToast.error('Failed to delete user');
      }
    } catch (error) {
      sonnerToast.error('Failed to delete user');
    } finally {
      setDeleteDialogOpen(false);
      setUserToDelete(null);
    }
  };

  if (status === 'loading' || loading) return <div>Loading...</div>;
  if (session?.user?.role !== 'admin') return null;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header activeTab="admin" setActiveTab={(tab) => {
        if (tab !== 'admin') {
          router.push('/');
        }
      }} />
      <main className="flex-1 container mx-auto px-4 py-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>User Management</CardTitle>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={() => setEditUser(null)}>
                  <UserPlus className="mr-2 h-4 w-4" />
                  Add User
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editUser ? 'Edit User' : 'Add User'}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSaveUser} className="space-y-4">
                  <div>
                    <Label>Username</Label>
                    <Input name="username" defaultValue={editUser?.username} required />
                  </div>
                  <div>
                    <Label>Password</Label>
                    <div className="relative">
                      <Input 
                        name="password" 
                        type={showPassword ? "text" : "password"} 
                        required={!editUser} 
                        placeholder={editUser ? 'Leave empty to keep current' : ''}
                        className="pr-10"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                  <div>
                    <Label>Role</Label>
                    <select name="role" defaultValue={editUser?.role || 'user'} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                      <option value="user">User</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                  <div>
                    <Label>Expiry Date (Leave empty for admin)</Label>
                    <Input name="expiryDate" type="date" defaultValue={editUser?.expiryDate} />
                  </div>
                  <div>
                    <Label>Company Name (Optional)</Label>
                    <Input name="companyName" defaultValue={editUser?.companyName} />
                  </div>
                  <Button type="submit" className="w-full">Save</Button>
                </form>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Username</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Expiry Date</TableHead>
                  <TableHead>Created At</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.length > 0 ? users.map((user) => (
                  <TableRow key={user._id}>
                    <TableCell>{user.username}</TableCell>
                    <TableCell>{user.role}</TableCell>
                    <TableCell>{user.companyName || '-'}</TableCell>
                    <TableCell>{formatExpiryDate(user.expiryDate)}</TableCell>
                    <TableCell>{user.createdAt ? formatDate(user.createdAt) : '-'}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => { setEditUser(user); setDialogOpen(true); }}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => { setUserToDelete(user._id); setDeleteDialogOpen(true); }}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )) : (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center">No users found</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </main>
      <div className="container mx-auto px-4 pb-4">
        <Footer />
      </div>
      
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete User</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this user? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
