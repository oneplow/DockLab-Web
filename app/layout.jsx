import './globals.css'
import Providers from './providers'
import ClientLayout from '@/components/layout/ClientLayout'

export const metadata = {
    title: 'Docklab — Docker Management Platform',
    description: 'Web-based Docker management platform',
}

export default function RootLayout({ children }) {
    return (
        <html lang="en" className="light" suppressHydrationWarning>
            <head>
                <link rel="preconnect" href="https://fonts.googleapis.com" />
                <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
                <link
                    href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap"
                    rel="stylesheet"
                />
            </head>
            <body className="min-h-screen bg-background font-sans antialiased text-foreground">
                <Providers>
                    <ClientLayout>{children}</ClientLayout>
                </Providers>
            </body>
        </html>
    )
}
