import NextAuth from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import clientPromise from '@/lib/mongodb';

export const authOptions = {
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) {
          return null;
        }

        const client = await clientPromise;
        const db = client.db('slitter-optimizers');
        
        const user = await db.collection('users').findOne({
          username: credentials.username,
          password: credentials.password
        });

        if (!user) {
          return null;
        }

        // Check expiry only for non-admin users
        if (user.role !== 'admin' && user.expiryDate) {
          const expiryDate = new Date(user.expiryDate);
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          expiryDate.setHours(0, 0, 0, 0);
          
          if (today > expiryDate) {
            return null;
          }
        }

        return {
          id: user._id.toString(),
          name: user.username,
          role: user.role || 'user',
          expiryDate: user.expiryDate,
          companyName: user.companyName
        };
      }
    })
  ],
  pages: {
    signIn: '/login',
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.expiryDate = user.expiryDate;
        token.companyName = user.companyName;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.role = token.role as string;
      session.user.expiryDate = token.expiryDate as string;
      session.user.companyName = token.companyName as string;
      
      if (token.role !== 'admin' && token.expiryDate) {
        const expiryDate = new Date(token.expiryDate as string);
        const today = new Date();
        
        if (today > expiryDate) {
          return { ...session, user: null };
        }
      }
      return session;
    }
  },
  session: {
    strategy: 'jwt',
    maxAge: 2 * 60 * 60, // 2 hours
  },
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
