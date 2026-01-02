-- Experiment Groups: Group comparable bot versions
CREATE TABLE public.experiment_groups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  template_id TEXT NOT NULL REFERENCES public.strategy_templates(id),
  dataset_id UUID REFERENCES public.datasets(id),
  timeframe TEXT NOT NULL DEFAULT '5m',
  session TEXT NOT NULL DEFAULT 'RTH',
  objective_config JSONB NOT NULL DEFAULT '{"pf_weight": 0.35, "dd_penalty": 0.15, "return_weight": 0.25, "sharpe_weight": 0.25}'::jsonb,
  champion_version_id UUID REFERENCES public.bot_versions(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.experiment_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public access to experiment_groups" 
ON public.experiment_groups 
FOR ALL 
USING (true)
WITH CHECK (true);

-- Iterations: Track every mutation/change in the system
CREATE TABLE public.iterations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  experiment_group_id UUID NOT NULL REFERENCES public.experiment_groups(id) ON DELETE CASCADE,
  parent_version_id UUID REFERENCES public.bot_versions(id),
  child_version_id UUID NOT NULL REFERENCES public.bot_versions(id),
  iteration_number INTEGER NOT NULL DEFAULT 1,
  trigger_type TEXT NOT NULL DEFAULT 'manual', -- manual, auto_tuner, ai_advice
  param_diff JSONB,
  risk_diff JSONB,
  ai_rationale TEXT,
  gate_results JSONB,
  metric_before JSONB,
  metric_after JSONB,
  accepted BOOLEAN NOT NULL DEFAULT false,
  reject_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.iterations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public access to iterations" 
ON public.iterations 
FOR ALL 
USING (true)
WITH CHECK (true);

-- Add experiment_group_id to bot_versions for grouping
ALTER TABLE public.bot_versions 
ADD COLUMN experiment_group_id UUID REFERENCES public.experiment_groups(id);

-- Add is_champion flag to bot_versions
ALTER TABLE public.bot_versions 
ADD COLUMN is_champion BOOLEAN NOT NULL DEFAULT false;

-- Pipeline state tracking for bots
CREATE TABLE public.pipeline_states (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bot_id UUID NOT NULL REFERENCES public.bots(id) ON DELETE CASCADE UNIQUE,
  current_step TEXT NOT NULL DEFAULT 'create', -- create, dataset, configure, backtest, review, iterate
  experiment_group_id UUID REFERENCES public.experiment_groups(id),
  last_run_id UUID REFERENCES public.runs(id),
  last_version_id UUID REFERENCES public.bot_versions(id),
  auto_mode BOOLEAN NOT NULL DEFAULT false,
  max_iterations INTEGER NOT NULL DEFAULT 20,
  mutation_aggressiveness NUMERIC NOT NULL DEFAULT 0.5,
  stop_conditions JSONB NOT NULL DEFAULT '{"max_dd": 0.15, "min_improvement": 0.03}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.pipeline_states ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public access to pipeline_states" 
ON public.pipeline_states 
FOR ALL 
USING (true)
WITH CHECK (true);

-- Create indexes for performance
CREATE INDEX idx_iterations_experiment ON public.iterations(experiment_group_id);
CREATE INDEX idx_iterations_child_version ON public.iterations(child_version_id);
CREATE INDEX idx_bot_versions_experiment ON public.bot_versions(experiment_group_id);
CREATE INDEX idx_experiment_groups_template ON public.experiment_groups(template_id);
CREATE INDEX idx_experiment_groups_dataset ON public.experiment_groups(dataset_id);

-- Update trigger for updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_experiment_groups_updated_at
BEFORE UPDATE ON public.experiment_groups
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_pipeline_states_updated_at
BEFORE UPDATE ON public.pipeline_states
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();