import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Trajectory — The Autonomous Student Opportunity System',
  description: 'Your student opportunity inbox. Discover, understand, decide, and follow through.'
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700;12..96,800&family=Instrument+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen antialiased bg-background text-foreground font-sans">
        {children}
      </body>
    </html>
  );
}
