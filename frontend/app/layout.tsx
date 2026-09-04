import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { GeistPixelSquare } from "geist/font/pixel";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { TelemetryProvider } from "@/components/telemetry-provider";
import { CommandDock } from "@/components/command-dock";

export const metadata: Metadata = {
  title: "UAV-07 | Propulsion GCS",
  description: "UAV propulsion ground control station",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${GeistSans.variable} ${GeistMono.variable} ${GeistPixelSquare.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
          <TelemetryProvider>
            <div className="flex min-h-screen flex-col">
              <div className="flex-1">{children}</div>
              <CommandDock />
            </div>
          </TelemetryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

