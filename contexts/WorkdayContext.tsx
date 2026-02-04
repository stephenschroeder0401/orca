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
  hasBackgroundLocationPermission: boolean; // Critical for tracking when app is backgrounded

  // Actions
  clockIn: (notes?: string) => Promise<{ workdayId: string; clockPeriodId: string; wasReopened: boolean; hasBackgroundPermission: boolean }>;
  clockOut: () => Promise<void>;
  startJob: (params: {
    notes?: string;
    propertyId?: string;
    billingCategoryId?: string;
    unitId?: string;
  }) => Promise<{ workdayId: string; clockSessionId: string; didClockIn: boolean; hasBackgroundPermission: boolean }>;
  endJob: () => Promise<void>;
  endWorkday: () => Promise<void>;
  refreshState: () => Promise<void>;
}

const WorkdayContext = createContext<WorkdayContextType | null>(null);

interface WorkdayProviderProps {
  children: ReactNode;
  employeeId: string;
}

export function WorkdayProvider({ children, employeeId }: WorkdayProviderProps) {
  const [workdayId, setWorkdayId] = useState<string | null>(null);
  const [clockPeriodId, setClockPeriodId] = useState<string | null>(null);
  const [clockSessionId, setClockSessionId] = useState<string | null>(null);
  const [workdayStartTime, setWorkdayStartTime] = useState<Date | null>(null);
  const [clockPeriodStartTime, setClockPeriodStartTime] = useState<Date | null>(null);
  const [isGpsTracking, setIsGpsTracking] = useState(false);
  const [hasLocationPermission, setHasLocationPermission] = useState(false);
  const [hasBackgroundLocationPermission, setHasBackgroundLocationPermission] = useState(false);

  // Check for existing active workday/session on mount
  useEffect(() => {
    refreshState();
  }, []);

  async function refreshState(): Promise<void> {
    try {
      // Get stored session ID (still needed for clock session check)
      const storedSessionId = await getActiveClockSessionId();

      // Always check server for active workday
      const { data: workdayData, error: workdayError } = await supabase.schema('orca').rpc('get_active_workday');
      if (!workdayError && workdayData && workdayData.length > 0) {
        setWorkdayId(workdayData[0].id);
        setWorkdayStartTime(new Date(workdayData[0].start_time));
        await setActiveWorkdayId(workdayData[0].id);
      } else {
        setWorkdayId(null);
        setWorkdayStartTime(null);
        await setActiveWorkdayId(null);
      }

      // Always check server for active clock period (don't rely on stored ID)
      const { data: periodData, error: periodError } = await supabase.schema('orca').rpc('get_active_clock_period');
      if (!periodError && periodData && periodData.length > 0) {
        setClockPeriodId(periodData[0].id);
        setClockPeriodStartTime(new Date(periodData[0].start_time));
        await setActiveClockPeriodId(periodData[0].id);
        // Also ensure workday is set from the period
        if (periodData[0].workday_id) {
          setWorkdayId(periodData[0].workday_id);
          await setActiveWorkdayId(periodData[0].workday_id);
        }
      } else {
        setClockPeriodId(null);
        setClockPeriodStartTime(null);
        await setActiveClockPeriodId(null);
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
      setHasBackgroundLocationPermission(permissions.background);
    } catch (error) {
      console.error('[WorkdayContext] Error refreshing state:', error);
    }
  }

  async function clockIn(notes?: string): Promise<{ workdayId: string; clockPeriodId: string; wasReopened: boolean; hasBackgroundPermission: boolean }> {
    console.log('[WorkdayContext] clockIn called with notes:', notes);

    // Call the clock_in RPC
    const { data, error } = await supabase.schema('orca').rpc('clock_in', {
      p_notes: notes || null,
    });

    console.log('[WorkdayContext] clock_in RPC response:', { data, error });

    if (error) {
      console.error('[WorkdayContext] Error clocking in:', error);
      throw error;
    }

    if (!data) {
      console.error('[WorkdayContext] clock_in returned no data');
      throw new Error('clock_in RPC returned no data');
    }

    const { workday_id, clock_period_id, was_reopened } = data;

    setWorkdayId(workday_id);
    setClockPeriodId(clock_period_id);
    setWorkdayStartTime(new Date());
    setClockPeriodStartTime(new Date());
    await setActiveWorkdayId(workday_id);
    await setActiveClockPeriodId(clock_period_id);

    // Request location permissions but DON'T start GPS tracking yet
    // GPS tracking will start in startJob() AFTER the clock session is created and stored
    // This prevents location points from being recorded without a clock_session_id
    const permissions = await requestLocationPermissions();
    setHasLocationPermission(permissions.foreground);
    setHasBackgroundLocationPermission(permissions.background);

    return {
      workdayId: workday_id,
      clockPeriodId: clock_period_id,
      wasReopened: was_reopened || false,
      hasBackgroundPermission: permissions.background,
    };
  }

  async function clockOut(): Promise<void> {
    if (!clockPeriodId) {
      console.log('[WorkdayContext] No active clock period to end');
      return;
    }

    try {
      // End any active job first (creates time_entry from clock_session)
      if (clockSessionId) {
        console.log('[WorkdayContext] Ending active job before clocking out...');
        await endJob();
      }

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
  }): Promise<{ workdayId: string; clockSessionId: string; didClockIn: boolean; hasBackgroundPermission: boolean }> {
    console.log('[WorkdayContext] startJob called with params:', params);
    console.log('[WorkdayContext] Current state:', { workdayId, clockPeriodId, clockSessionId });

    let activeWorkdayId = workdayId;
    let activeClockPeriodId = clockPeriodId;
    let didClockIn = false;
    let backgroundPermission = hasBackgroundLocationPermission;

    // Clock in if not already clocked in
    if (!activeClockPeriodId) {
      const result = await clockIn();
      activeWorkdayId = result.workdayId;
      activeClockPeriodId = result.clockPeriodId;
      didClockIn = true;
      backgroundPermission = result.hasBackgroundPermission;
    } else if (!activeWorkdayId) {
      // Already clocked in but workdayId is stale - fetch from clock_period
      const { data: periodData } = await supabase.schema('orca').rpc('get_active_clock_period');
      if (periodData && periodData.length > 0) {
        activeWorkdayId = periodData[0].workday_id;
        setWorkdayId(activeWorkdayId);
        await setActiveWorkdayId(activeWorkdayId);
      } else {
        throw new Error('Could not find active clock period');
      }
    }

    // Start clock session
    console.log('[WorkdayContext] Calling start_clock_session with:', {
      p_workday_id: activeWorkdayId,
      p_notes: params.notes || null,
      p_property_id: params.propertyId || null,
      p_billing_category_id: params.billingCategoryId || null,
      p_unit_id: params.unitId || null,
    });

    const { data: sessionData, error: sessionError } = await supabase.schema('orca').rpc('start_clock_session', {
      p_workday_id: activeWorkdayId,
      p_notes: params.notes || null,
      p_property_id: params.propertyId || null,
      p_billing_category_id: params.billingCategoryId || null,
      p_unit_id: params.unitId || null,
    });

    console.log('[WorkdayContext] start_clock_session response:', { sessionData, sessionError });

    if (sessionError) {
      console.error('[WorkdayContext] Error starting clock session:', sessionError);
      throw sessionError;
    }

    setClockSessionId(sessionData);
    await setActiveClockSessionId(sessionData);

    // Start GPS tracking AFTER the clock session ID is stored
    // This ensures all location points will have the clock_session_id
    if (!isGpsTracking && hasLocationPermission) {
      const trackingResult = await startLocationTracking();
      setIsGpsTracking(trackingResult.success);
      setHasBackgroundLocationPermission(trackingResult.hasBackgroundPermission);
      backgroundPermission = trackingResult.hasBackgroundPermission;

      if (trackingResult.success && !trackingResult.hasBackgroundPermission) {
        console.warn('[WorkdayContext] GPS tracking started but NO BACKGROUND PERMISSION - tracking will stop when app is backgrounded');
      }
    }

    return {
      workdayId: activeWorkdayId!,
      clockSessionId: sessionData,
      didClockIn,
      hasBackgroundPermission: backgroundPermission,
    };
  }

  async function endJob(): Promise<void> {
    if (!clockSessionId) {
      console.log('[WorkdayContext] No active clock session to end');
      return;
    }

    try {
      // 1. Get the clock session data first
      // Note: Select explicit columns to handle potential column name variations (start_time vs start_ts)
      const { data: session, error: fetchError } = await supabase
        .schema('orca')
        .from('clock_sessions')
        .select('id, user_id, client_id, workday_id, property_id, billing_category_id, unit_id, notes, start_time')
        .eq('id', clockSessionId)
        .single();

      if (fetchError) throw fetchError;

      // Validate we have a start time
      if (!session.start_time) {
        console.error('[WorkdayContext] Clock session missing start_time:', session);
        throw new Error('Clock session has no start time');
      }

      // 2. Update end_time on clock_session
      const endTime = new Date().toISOString();
      const { error: updateError } = await supabase
        .schema('orca')
        .from('clock_sessions')
        .update({ end_time: endTime })
        .eq('id', clockSessionId);

      if (updateError) throw updateError;

      // 3. Create time_entry from the clock_session
      const startTimeMs = new Date(session.start_time).getTime();
      const endTimeMs = new Date(endTime).getTime();
      const durationMinutes = Math.floor((endTimeMs - startTimeMs) / 60000);

      // Debug logging for timer issues
      console.log('[WorkdayContext] Creating time_entry:', {
        sessionId: clockSessionId,
        startTime: session.start_time,
        endTime,
        startTimeMs,
        endTimeMs,
        durationMinutes,
      });

      const { error: insertError } = await supabase
        .schema('orca')
        .from('time_entries')
        .insert({
          clock_session_id: clockSessionId,
          user_id: session.user_id,
          employee_id: employeeId,
          client_id: session.client_id,
          organization_id: session.client_id,
          property_id: session.property_id,
          billing_category_id: session.billing_category_id,
          unit_id: session.unit_id,
          start_ts: session.start_time,
          end_ts: endTime,
          duration_minutes: durationMinutes,
          notes: session.notes,
          status: 'draft',
          source: 'mobile',
          locked: false,
        });

      if (insertError) {
        console.error('[WorkdayContext] Error creating time_entry:', insertError);
        // Don't throw - clock session was ended successfully
      }

      setClockSessionId(null);
      await setActiveClockSessionId(null);

      // Stop GPS tracking when job ends - locations should only be recorded with a clock_session_id
      // GPS will restart when user starts a new job
      await stopLocationTracking();
      setIsGpsTracking(false);
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
      // End any active job first (creates time_entry from clock_session)
      if (clockSessionId) {
        console.log('[WorkdayContext] Ending active job before ending workday...');
        await endJob();
      }

      // Clock out if still clocked in
      if (clockPeriodId) {
        console.log('[WorkdayContext] Clocking out before ending workday...');
        const { error: clockOutError } = await supabase.schema('orca').rpc('clock_out');
        if (clockOutError) {
          console.error('[WorkdayContext] Error clocking out:', clockOutError);
        }
      }

      // End the workday
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
        hasBackgroundLocationPermission,
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
