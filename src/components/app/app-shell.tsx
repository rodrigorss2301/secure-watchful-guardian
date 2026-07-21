import { AppSidebar } from "./app-sidebar";
import { AppHeader } from "./app-header";
import { SidebarProvider } from "@/components/ui/sidebar";
import React from "react";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full flex-col bg-muted/30">
        <AppHeader />
        <div className="flex flex-1 overflow-hidden w-full">
          <AppSidebar />
          <main className="flex-1 overflow-y-auto p-6 lg:p-8">
            <div className="mx-auto max-w-7xl animate-in fade-in slide-in-from-bottom-4 duration-500">
              {children}
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

// O componente que estava faltando!
export function PageHeader({ 
  title, 
  description, 
  children 
}: { 
  title: string; 
  description?: string; 
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">{title}</h1>
        {description && (
          <p className="text-muted-foreground mt-1">{description}</p>
        )}
      </div>
      {children && (
        <div className="flex items-center gap-2">
          {children}
        </div>
      )}
    </div>
  );
}