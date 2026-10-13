import type { Metadata } from 'next';
import '../src/styles.css';

export const metadata: Metadata = {
  title: 'Agentic Proof Protocol',
  description: 'Verifiable authority for AI agents on Monad.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
