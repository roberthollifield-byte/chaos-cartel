import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";

// Custom hook: wouter's default hash location includes the query string in the path,
// which breaks matching on routes like /thanks?type=... . Strip search off the path.
function useHashLocationNoSearch(): [string, (to: string) => void] {
  const [rawPath, navigate] = useHashLocation();
  const path = rawPath.split("?")[0] || "/";
  return [path, navigate];
}
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import HomePage from "@/pages/home";
import SessionsPage from "@/pages/sessions";
import SessionDetailPage from "@/pages/session-detail";
import RulesPage from "@/pages/rules";
import CrewPage from "@/pages/crew";
import MerchPage from "@/pages/merch";
import ThanksPage from "@/pages/thanks";
import AdminPage from "@/pages/admin";

function AppRouter() {
  return (
    <Switch>
      <Route path="/" component={HomePage} />
      <Route path="/sessions" component={SessionsPage} />
      <Route path="/sessions/:slug" component={SessionDetailPage} />
      <Route path="/rules" component={RulesPage} />
      <Route path="/crew" component={CrewPage} />
      <Route path="/merch" component={MerchPage} />
      <Route path="/thanks" component={ThanksPage} />
      <Route path="/admin" component={AdminPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router hook={useHashLocationNoSearch}>
          <AppRouter />
        </Router>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
