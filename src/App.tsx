import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Datasets from "./pages/Datasets";
import DatasetDetail from "./pages/DatasetDetail";
import Templates from "./pages/Templates";
import Bots from "./pages/Bots";
import NewBot from "./pages/NewBot";
import BotDetail from "./pages/BotDetail";
import StartRun from "./pages/StartRun";
import Runs from "./pages/Runs";
import RunDetail from "./pages/RunDetail";
import Leaderboard from "./pages/Leaderboard";
import Experiments from "./pages/Experiments";
import ExperimentGroupsPage from "./pages/ExperimentGroupsPage";
import ExperimentGroupDetail from "./pages/ExperimentGroupDetail";
import AutoTuner from "./pages/AutoTuner";
import PaperTrading from "./pages/PaperTrading";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/datasets" element={<Datasets />} />
          <Route path="/datasets/:id" element={<DatasetDetail />} />
          <Route path="/templates" element={<Templates />} />
          <Route path="/bots" element={<Bots />} />
          <Route path="/bots/new" element={<NewBot />} />
          <Route path="/bots/:id" element={<BotDetail />} />
          <Route path="/bots/:id/run" element={<StartRun />} />
          <Route path="/bots/:botId/tuner" element={<AutoTuner />} />
          <Route path="/runs" element={<Runs />} />
          <Route path="/runs/:id" element={<RunDetail />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/experiments" element={<Experiments />} />
          <Route path="/experiment-groups" element={<ExperimentGroupsPage />} />
          <Route path="/experiments/:id" element={<ExperimentGroupDetail />} />
          <Route path="/paper/:id" element={<PaperTrading />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
