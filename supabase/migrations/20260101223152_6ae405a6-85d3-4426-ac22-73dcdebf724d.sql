-- Add combined dataset support
ALTER TABLE datasets 
ADD COLUMN is_combined BOOLEAN DEFAULT false,
ADD COLUMN source_dataset_ids TEXT[] DEFAULT NULL;