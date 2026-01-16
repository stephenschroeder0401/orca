-- Enable RLS on orca schema tables
ALTER TABLE orca.time_entries ENABLE ROW LEVEL SECURITY;

-- Grant usage on orca schema to authenticated users
GRANT USAGE ON SCHEMA orca TO authenticated;
GRANT USAGE ON SCHEMA orca TO anon;

-- Grant permissions on tables
GRANT ALL ON orca.time_entries TO authenticated;
GRANT SELECT ON orca.time_entries TO anon;

-- RLS Policies for time_entries
-- Users can view all time entries (adjust this based on your needs)
CREATE POLICY "Users can view all time entries"
  ON orca.time_entries
  FOR SELECT
  TO authenticated
  USING (true);

-- Users can insert their own time entries
CREATE POLICY "Users can insert time entries"
  ON orca.time_entries
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Users can update all time entries (adjust based on your needs)
CREATE POLICY "Users can update time entries"
  ON orca.time_entries
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Users can delete all time entries (adjust based on your needs)
CREATE POLICY "Users can delete time entries"
  ON orca.time_entries
  FOR DELETE
  TO authenticated
  USING (true);
