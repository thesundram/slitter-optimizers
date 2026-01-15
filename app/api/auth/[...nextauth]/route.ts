import NextAuth from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import clientPromise from '@/lib/mongodb';
import bcrypt from 'bcryptjs';

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

        try {
          const client = await clientPromise;
          const db = client.db('slitter-optimizers');
          
          const user = await db.collection('users').findOne({
            username: credentials.username
          });

          if (!user) {
            return null;
          }

          // Compare password
          const isPasswordValid = await bcrypt.compare(credentials.password, user.password);
          
          if (!isPasswordValid) {
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
        } catch (error) {
          console.error('Auth error:', error);
          return null;
        }
      }
    })
  ],
  pages: {
    signIn: '/login',
  },
  secret: process.env.NEXTAUTH_SECRET,
  callbacks: {
    async jwt({ token, user, account }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.expiryDate = user.expiryDate;
        token.companyName = user.companyName;
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
        session.user.expiryDate = token.expiryDate as string;
        session.user.companyName = token.companyName as string;
      }
      
      // Check expiry for non-admin users
      if (token.role !== 'admin' && token.expiryDate) {
        const expiryDate = new Date(token.expiryDate as string);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        expiryDate.setHours(0, 0, 0, 0);
        
        if (today > expiryDate) {
          return { ...session, user: { ...session.user, expired: true } };
        }
      }
      return session;
    },
    async redirect({ url, baseUrl }) {
      // Allows relative callback URLs
      if (url.startsWith("/")) return `${baseUrl}${url}`;
      // Allows callback URLs on the same origin
      else if (new URL(url).origin === baseUrl) return url;
      return baseUrl;
    }
  },
  session: {
    strategy: 'jwt',
    maxAge: 2 * 60 * 60, // 2 hours
  },
  jwt: {
    maxAge: 2 * 60 * 60, // 2 hours
  },
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
