import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import {
  startLocationTracking,
  stopLocationTracking,
  setActiveWorkdayId,
  setActiveClockSessionId,
  setActiveClockPeriodId,
  getActiveWorkdayId,
  getActiveClockSessionId,
  getActiveClockPeriodId,
  requestLocationPermissions,
  checkLocationPermissions,
  isTrackingActive,
} from '../lib/locationService';

interface WorkdayContextType {
  // State
  workdayId: string | null;
  clockPeriodId: string | null;
  clockSessionId: string | null;
  workdayStartTime: Date | null;
  clockPeriodStartTime: Date | null;
  isWorkdayActive: boolean;
  isClockedIn: boolean;
  isClockSessionActive: boolean;
  isGpsTracking: boolean;
  hasLocationPermission: boolean;

  // Actions
  clockIn: (notes?: string) => Promise<{ workdayId: string; clockPeriodId: string; wasReopened: boolean }>;
  clockOut: () => Promise<void>;
  startJob: (params: {
    notes?: string;
    propertyId?: string;
    billingCategoryId?: string;
    unitId?: string;
  }) => Promise<{ workdayId: string; clockSessionId: string }>;
  endJob: () => Promise<void>;
  endWorkday: () => Promise<void>;
  refreshState: () => Promise<void>;
}

const WorkdayContext = createContext<WorkdayContextType | null>(null);

interface WorkdayProviderProps {
  children: ReactNode;
}

export function WorkdayProvider({ children }: WorkdayProviderProps) {
  const [workdayId, setWorkdayId] = useState<string | null>(null);
  const [clockPeriodId, setClockPeriodId] = useState<string | null>(null);
  const [clockSessionId, setClockSessionId] = useState<string | null>(null);
  const [workdayStartTime, setWorkdayStartTime] = useState<Date | null>(null);
  const [clockPeriodStartTime, setClockPeriodStartTime] = useState<Date | null>(null);
  const [isGpsTracking, setIsGpsTracking] = useState(false);
  const [hasLocationPermission, setHasLocationPermission] = useState(false);

  // Check for existing active workday/session on mount
  useEffect(() => {
    refreshState();
  }, []);

  async function refreshState(): Promise<void> {
    try {
      // Check stored IDs
      const storedWorkdayId = await getActiveWorkdayId();
      const storedPeriodId = await getActiveClockPeriodId();
      const storedSessionId = await getActiveClockSessionId();

      // Verify workday is still active on server
      if (storedWorkdayId) {
        const { data, error } = await supabase.schema('orca').rpc('get_active_workday');
        if (!error && data && data.length > 0) {
          setWorkdayId(data[0].id);
          setWorkdayStartTime(new Date(data[0].start_time));
          await setActiveWorkdayId(data[0].id);
        } else {
          // Workday no longer active, clear stored ID
          setWorkdayId(null);
          setWorkdayStartTime(null);
          await setActiveWorkdayId(null);
        }
      }

      // Check if there's an active clock period
      if (storedPeriodId) {
        const { data, error } = await supabase.schema('orca').rpc('get_active_clock_period');
        if (!error && data && data.length > 0) {
          setClockPeriodId(data[0].id);
          setClockPeriodStartTime(new Date(data[0].start_time));
          await setActiveClockPeriodId(data[0].id);
          // Also ensure workday is set from the period
          if (!workdayId && data[0].workday_id) {
            setWorkdayId(data[0].workday_id);
            await setActiveWorkdayId(data[0].workday_id);
          }
        } else {
          setClockPeriodId(null);
          setClockPeriodStartTime(null);
          await setActiveClockPeriodId(null);
        }
      }

      // Check if there's an active clock session
      if (storedSessionId) {
        const { data, error } = await supabase
          .schema('orca')
          .from('clock_sessions')
          .select('id, end_time')
          .eq('id', storedSessionId)
          .single();

        if (!error && data && !data.end_time) {
          setClockSessionId(data.id);
        } else {
          setClockSessionId(null);
          await setActiveClockSessionId(null);
        }
      }

      // Check GPS tracking status
      const tracking = await isTrackingActive();
      setIsGpsTracking(tracking);

      // Check permissions
      const permissions = await checkLocationPermissions();
      setHasLocationPermission(permissions.foreground);
    } catch (error) {
      console.error('[WorkdayContext] Error refreshing state:', error);
    }
  }

  async function clockIn(notes?: string): Promise<{ workdayId: string; clockPeriodId: string; wasReopened: boolean }> {
    // Call the clock_in RPC
    const { data, error } = await supabase.schema('orca').rpc('clock_in', {
      p_notes: notes || null,
    });

    if (error) {
      console.error('[WorkdayContext] Error clocking in:', error);
      throw error;
    }

    const { workday_id, clock_period_id, was_reopened } = data;

    setWorkdayId(workday_id);
    setClockPeriodId(clock_period_id);
    setWorkdayStartTime(new Date());
    setClockPeriodStartTime(new Date());
    await setActiveWorkdayId(workday_id);
    await setActiveClockPeriodId(clock_period_id);

    // Try to start GPS tracking when clocking in
    const permissions = await requestLocationPermissions();
    setHasLocationPermission(permissions.foreground);

    if (permissions.foreground) {
      const trackingStarted = await startLocationTracking();
      setIsGpsTracking(trackingStarted);
    }

    return {
      workdayId: workday_id,
      clockPeriodId: clock_period_id,
      wasReopened: was_reopened || false,
    };
  }

  async function clockOut(): Promise<void> {
    if (!clockPeriodId) {
      console.log('[WorkdayContext] No active clock period to end');
      return;
    }

    try {
      const { error } = await supabase.schema('orca').rpc('clock_out');

      if (error) throw error;

      // Stop GPS tracking when clocking out
      await stopLocationTracking();
      setIsGpsTracking(false);

      // Clear clock period state (but keep workday - user can clock back in)
      setClockPeriodId(null);
      setClockSessionId(null);
      setClockPeriodStartTime(null);
      await setActiveClockPeriodId(null);
      await setActiveClockSessionId(null);
    } catch (error) {
      console.error('[WorkdayContext] Error clocking out:', error);
      throw error;
    }
  }

  async function startJob(params: {
    notes?: string;
    propertyId?: string;
    billingCategoryId?: string;
    unitId?: string;
  }): Promise<{ workdayId: string; clockSessionId: string }> {
    let activeWorkdayId = workdayId;
    let activeClockPeriodId = clockPeriodId;

    // Clock in if not already clocked in
    if (!activeClockPeriodId) {
      const result = await clockIn();
      activeWorkdayId = result.workdayId;
      activeClockPeriodId = result.clockPeriodId;
    }

    // Start clock session
    const { data: sessionData, error: sessionError } = await supabase.schema('orca').rpc('start_clock_session', {
      p_workday_id: activeWorkdayId,
      p_notes: params.notes || null,
      p_property_id: params.propertyId || null,
      p_billing_category_id: params.billingCategoryId || null,
      p_unit_id: params.unitId || null,
    });

    if (sessionError) {
      console.error('[WorkdayContext] Error starting clock session:', sessionError);
      throw sessionError;
    }

    setClockSessionId(sessionData);
    await setActiveClockSessionId(sessionData);

    return {
      workdayId: activeWorkdayId!,
      clockSessionId: sessionData,
    };
  }

  async function endJob(): Promise<void> {
    if (!clockSessionId) {
      console.log('[WorkdayContext] No active clock session to end');
      return;
    }

    try {
      // End the clock session
      const { error } = await supabase
        .schema('orca')
        .from('clock_sessions')
        .update({ end_time: new Date().toISOString() })
        .eq('id', clockSessionId);

      if (error) throw error;

      setClockSessionId(null);
      await setActiveClockSessionId(null);

      // Note: We keep the workday active and GPS tracking running
      // User can start another job or explicitly end the workday
    } catch (error) {
      console.error('[WorkdayContext] Error ending clock session:', error);
      throw error;
    }
  }

  async function endWorkday(): Promise<void> {
    if (!workdayId) {
      console.log('[WorkdayContext] No active workday to end');
      return;
    }

    try {
      // This will also close any open clock periods and sessions
      const { error } = await supabase.schema('orca').rpc('end_workday', {
        p_workday_id: workdayId,
      });

      if (error) throw error;

      // Stop GPS tracking
      await stopLocationTracking();
      setIsGpsTracking(false);

      // Clear all state
      setWorkdayId(null);
      setClockPeriodId(null);
      setClockSessionId(null);
      setWorkdayStartTime(null);
      setClockPeriodStartTime(null);
      await setActiveWorkdayId(null);
      await setActiveClockPeriodId(null);
      await setActiveClockSessionId(null);
    } catch (error) {
      console.error('[WorkdayContext] Error ending workday:', error);
      throw error;
    }
  }

  return (
    <WorkdayContext.Provider
      value={{
        workdayId,
        clockPeriodId,
        clockSessionId,
        workdayStartTime,
        clockPeriodStartTime,
        isWorkdayActive: !!workdayId,
        isClockedIn: !!clockPeriodId,
        isClockSessionActive: !!clockSessionId,
        isGpsTracking,
        hasLocationPermission,
        clockIn,
        clockOut,
        startJob,
        endJob,
        endWorkday,
        refreshState,
      }}
    >
      {children}
    </WorkdayContext.Provider>
  );
}

export function useWorkday(): WorkdayContextType {
  const context = useContext(WorkdayContext);
  if (!context) {
    throw new Error('useWorkday must be used within a WorkdayProvider');
  }
  return context;
}
