import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('http://127.0.0.1:3000'),
  title: 'Музей Корця · цифрова колекція',
  description: 'Інтерактивний каталог експонатів Корецького історичного музею.',
  openGraph: {
    title: 'Музей Корця',
    description: 'Цифрова колекція',
    images: ['/og.png'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Музей Корця',
    description: 'Цифрова колекція',
    images: ['/og.png'],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="uk">
      <body>{children}</body>
    </html>
  );
}
