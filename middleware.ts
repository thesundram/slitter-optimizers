// import { withAuth } from 'next-auth/middleware';

// export default withAuth({
//   pages: {
//     signIn: '/login',
//   },
// });

// export const config = {
//   matcher: ['/((?!login|api/auth|_next/static|_next/image|favicon.ico).*)'],
// };
// middleware.ts
import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';

export default withAuth(
  function middleware(req) {
    const token = req.nextauth?.token;
    
    if (token?.isExpired) {
      const loginUrl = new URL('/login', req.url);
      loginUrl.searchParams.set('error', 'Account expired');
      return NextResponse.redirect(loginUrl);
    }
    
    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token }) => {
        return !!token && !token?.isExpired;
      },
    },
    pages: {
      signIn: '/login',
    },
  }
);

export const config = {
  matcher: ['/((?!login|api/auth|_next/static|_next/image|favicon.ico).*)'],
};