import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

const LOCATION_TASK_NAME = 'orca-background-location';
const ACTIVE_WORKDAY_KEY = 'orca_active_workday_id';
const ACTIVE_SESSION_KEY = 'orca_active_clock_session_id';
const ACTIVE_CLOCK_PERIOD_KEY = 'orca_active_clock_period_id';

// Storage helpers for active IDs
export async function setActiveWorkdayId(id: string | null): Promise<void> {
  if (id) {
    await AsyncStorage.setItem(ACTIVE_WORKDAY_KEY, id);
  } else {
    await AsyncStorage.removeItem(ACTIVE_WORKDAY_KEY);
  }
}

export async function getActiveWorkdayId(): Promise<string | null> {
  return AsyncStorage.getItem(ACTIVE_WORKDAY_KEY);
}

export async function setActiveClockSessionId(id: string | null): Promise<void> {
  if (id) {
    await AsyncStorage.setItem(ACTIVE_SESSION_KEY, id);
  } else {
    await AsyncStorage.removeItem(ACTIVE_SESSION_KEY);
  }
}

export async function getActiveClockSessionId(): Promise<string | null> {
  return AsyncStorage.getItem(ACTIVE_SESSION_KEY);
}

export async function setActiveClockPeriodId(id: string | null): Promise<void> {
  if (id) {
    await AsyncStorage.setItem(ACTIVE_CLOCK_PERIOD_KEY, id);
  } else {
    await AsyncStorage.removeItem(ACTIVE_CLOCK_PERIOD_KEY);
  }
}

export async function getActiveClockPeriodId(): Promise<string | null> {
  return AsyncStorage.getItem(ACTIVE_CLOCK_PERIOD_KEY);
}

// Save location points to Supabase
async function saveLocationPoints(locations: Location.LocationObject[]): Promise<void> {
  const workdayId = await getActiveWorkdayId();

  if (!workdayId) {
    console.log('[LocationService] No active workday, skipping location save');
    return;
  }

  const clockSessionId = await getActiveClockSessionId();

  for (const loc of locations) {
    try {
      const { error } = await supabase.schema('orca').rpc('append_location_point', {
        p_workday_id: workdayId,
        p_latitude: loc.coords.latitude,
        p_longitude: loc.coords.longitude,
        p_clock_session_id: clockSessionId,
        p_accuracy: loc.coords.accuracy,
        p_altitude: loc.coords.altitude,
        p_speed: loc.coords.speed,
        p_heading: loc.coords.heading,
        p_recorded_at: new Date(loc.timestamp).toISOString(),
      });

      if (error) {
        console.error('[LocationService] Error saving location point:', error);
        // TODO: Queue for offline retry
      }
    } catch (err) {
      console.error('[LocationService] Exception saving location:', err);
      // TODO: Queue for offline retry
    }
  }
}

// Define the background task
TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.error('[LocationService] Background task error:', error);
    return;
  }

  if (data) {
    const { locations } = data as { locations: Location.LocationObject[] };
    console.log('[LocationService] Received', locations.length, 'location(s)');
    await saveLocationPoints(locations);
  }
});

// Check if we have location permissions
export async function checkLocationPermissions(): Promise<{
  foreground: boolean;
  background: boolean;
}> {
  const foreground = await Location.getForegroundPermissionsAsync();
  const background = await Location.getBackgroundPermissionsAsync();

  return {
    foreground: foreground.status === 'granted',
    background: background.status === 'granted',
  };
}

// Request location permissions
export async function requestLocationPermissions(): Promise<{
  foreground: boolean;
  background: boolean;
}> {
  // Request foreground first
  const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();

  if (foregroundStatus !== 'granted') {
    return { foreground: false, background: false };
  }

  // Then request background
  const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();

  return {
    foreground: foregroundStatus === 'granted',
    background: backgroundStatus === 'granted',
  };
}

// Start background location tracking
export async function startLocationTracking(): Promise<boolean> {
  try {
    // Check if already tracking
    const isTracking = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
    if (isTracking) {
      console.log('[LocationService] Already tracking, skipping start');
      return true;
    }

    // Verify we have permissions
    const permissions = await checkLocationPermissions();
    if (!permissions.foreground) {
      console.log('[LocationService] No foreground permission, cannot start tracking');
      return false;
    }

    await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
      accuracy: Location.Accuracy.High,
      timeInterval: 30000, // 30 seconds
      distanceInterval: 10, // 10 meters minimum movement
      foregroundService: {
        notificationTitle: 'Orca is tracking',
        notificationBody: 'Your work route is being recorded',
        notificationColor: '#3b82f6',
      },
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
      deferredUpdatesInterval: 30000,
      deferredUpdatesDistance: 10,
    });

    console.log('[LocationService] Location tracking started');
    return true;
  } catch (err) {
    console.error('[LocationService] Failed to start tracking:', err);
    return false;
  }
}

// Stop background location tracking
export async function stopLocationTracking(): Promise<void> {
  try {
    const isTracking = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
    if (isTracking) {
      await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
      console.log('[LocationService] Location tracking stopped');
    }
  } catch (err) {
    console.error('[LocationService] Failed to stop tracking:', err);
  }
}

// Check if location tracking is active
export async function isTrackingActive(): Promise<boolean> {
  try {
    return await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
  } catch {
    return false;
  }
}

// Get current location (one-shot)
export async function getCurrentLocation(): Promise<Location.LocationObject | null> {
  try {
    const permissions = await checkLocationPermissions();
    if (!permissions.foreground) {
      return null;
    }

    return await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });
  } catch (err) {
    console.error('[LocationService] Failed to get current location:', err);
    return null;
  }
}
