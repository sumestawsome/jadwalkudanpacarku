import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ThemeProvider } from "@/components/theme/theme-provider";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Jadwalku • Asisten Jadwal & Tugas Kuliah Pintar",
  description:
    "Asisten jadwal dan pengingat tugas kuliah personal & couple dengan integrasi bot WhatsApp dan kecerdasan buatan Gemini Flash.",
  openGraph: {
    title: "Jadwalku • Asisten Jadwal & Tugas Kuliah Pintar",
    description: "Pantau jadwal dan tenggat tugas kuliah secara real-time.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="id"
      className={`${inter.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script
          id="jadwalku-theme-init"
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var storedTheme = localStorage.getItem('jadwalku-theme');
                  // Default to light mode
                  var theme = storedTheme === 'dark' ? 'dark' : 'light';
                  document.documentElement.classList.toggle('dark', theme === 'dark');
                } catch (error) {}
              })();
            `,
          }}
        />
      </head>
      <body className="min-h-full bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 font-sans">
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
