import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useWorkday } from '../contexts/WorkdayContext';

export function ClockTimer() {
  const { isClockedIn, clockPeriodStartTime } = useWorkday();
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    if (!clockPeriodStartTime) {
      setElapsedSeconds(0);
      return;
    }

    // Calculate initial elapsed time
    const now = new Date();
    const diff = Math.floor((now.getTime() - clockPeriodStartTime.getTime()) / 1000);
    setElapsedSeconds(diff);

    const interval = setInterval(() => {
      const now = new Date();
      const diff = Math.floor((now.getTime() - clockPeriodStartTime.getTime()) / 1000);
      setElapsedSeconds(diff);
    }, 1000);

    return () => clearInterval(interval);
  }, [clockPeriodStartTime]);

  function formatTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  if (!isClockedIn) {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.dot} />
      <Text style={styles.text}>{formatTime(elapsedSeconds)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 55,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#dcfce7',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    zIndex: 1000,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#22c55e',
    marginRight: 8,
  },
  text: {
    fontSize: 16,
    fontWeight: '700',
    color: '#166534',
    fontVariant: ['tabular-nums'],
  },
});
