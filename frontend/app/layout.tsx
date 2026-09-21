import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { GeistPixelSquare } from "geist/font/pixel";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { TelemetryProvider } from "@/components/telemetry-provider";
import { AICopilotProvider } from "@/components/ai-copilot-context";
import { AICopilotRightPanel } from "@/components/ai-copilot-right-panel";
import { CommandDock } from "@/components/command-dock";
import { BackendGate } from "@/components/backend-gate";

import { PageTransition } from "@/components/page-transition";

export const metadata: Metadata = {
  title: "PropulsionX | UAV-07 Propulsion GCS",
  description: "PropulsionX — AI-powered UAV propulsion ground control with Nexus intelligence engine",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${GeistSans.variable} ${GeistMono.variable} ${GeistPixelSquare.variable} h-full overflow-hidden overscroll-none antialiased`}
    >
      <body className="h-screen w-screen overflow-hidden overscroll-none flex flex-col antialiased">
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
          <TelemetryProvider>
            <AICopilotProvider>
              <BackendGate>
                <div className="flex h-screen max-h-screen flex-col overflow-hidden">
                  <div className="flex flex-1 min-h-0 w-full overflow-hidden">
                    {/* Main page independent scroll container (overflows for standard dashboard pages, locks to hidden for fixed-layout pages like AI Engine) */}
                    <div className="flex-1 min-w-0 h-full overflow-y-auto overflow-x-hidden overscroll-contain scrollbar-thin has-[[data-fixed-layout]]:overflow-hidden">
                      <PageTransition>{children}</PageTransition>
                    </div>
                    {/* Dedicated Chatbot right sidebar — independent scroll container */}
                    <AICopilotRightPanel />
                  </div>
                  <CommandDock />
                </div>
              </BackendGate>
            </AICopilotProvider>
          </TelemetryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

