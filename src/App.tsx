import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Dashboard from "./pages/Dashboard";
<<<<<<< HEAD
import Repository from "./pages/Repository";
import NotFound from "./pages/NotFound";
import { AuthProvider } from "./lib/auth";
import ViewportModeButton from "./components/ViewportModeButton";
import SystemStatusIndicator from "./components/SystemStatusIndicator";
=======
import NotFound from "./pages/NotFound";
>>>>>>> f3f772e51a1bb0edb326720cb816f9bf0af3f95c

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
<<<<<<< HEAD
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/repository" element={<Repository />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
          <SystemStatusIndicator />
          <ViewportModeButton />
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
=======
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
>>>>>>> f3f772e51a1bb0edb326720cb816f9bf0af3f95c
  </QueryClientProvider>
);

export default App;
