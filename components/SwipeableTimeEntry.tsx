import React from 'react';
import { View, Text, StyleSheet, Pressable, Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Card, CardContent } from '~/components/ui/card';
import { Trash2 } from 'lucide-react-native';

const SCREEN_WIDTH = Dimensions.get('window').width;
const DELETE_BUTTON_WIDTH = 80;
const AUTO_DELETE_THRESHOLD = SCREEN_WIDTH * 0.7;

interface TimeEntry {
  id: string;
  start_time: string;
  end_time: string | null;
  property_id: string | null;
  billing_category_id: string | null;
  notes: string | null;
}

interface Property {
  id: string;
  name: string;
}

interface BillingCategory {
  id: string;
  name: string;
}

interface SwipeableTimeEntryProps {
  item: TimeEntry;
  property?: Property;
  billingCategory?: BillingCategory;
  onDelete: (id: string) => void;
  formatTime: (dateString: string) => string;
  formatDuration: (startTs: string, endTs: string | null) => string;
}

export default function SwipeableTimeEntry({
  item,
  property,
  billingCategory,
  onDelete,
  formatTime,
  formatDuration,
}: SwipeableTimeEntryProps) {
  const translateX = useSharedValue(0);
  const startX = useSharedValue(0);
  const isDeleting = useSharedValue(false);

  const handleDelete = () => {
    onDelete(item.id);
  };

  const confirmDelete = () => {
    isDeleting.value = true;
    translateX.value = withTiming(-SCREEN_WIDTH, { duration: 150 }, () => {
      runOnJS(handleDelete)();
    });
  };

  const panGesture = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .onStart(() => {
      startX.value = translateX.value;
    })
    .onUpdate((event) => {
      if (isDeleting.value) return;
      const newX = startX.value + event.translationX;
      // Clamp: don't go past 0 (right edge), allow going left
      translateX.value = Math.min(0, newX);
    })
    .onEnd(() => {
      if (isDeleting.value) return;

      if (translateX.value < -AUTO_DELETE_THRESHOLD) {
        // Auto-delete if swiped past 70%
        isDeleting.value = true;
        translateX.value = withTiming(-SCREEN_WIDTH, { duration: 150 }, () => {
          runOnJS(handleDelete)();
        });
      } else if (translateX.value < -DELETE_BUTTON_WIDTH / 2) {
        // Snap to show delete button
        translateX.value = withSpring(-DELETE_BUTTON_WIDTH, {
          damping: 20,
          stiffness: 200,
        });
      } else {
        // Snap back to closed
        translateX.value = withSpring(0, {
          damping: 20,
          stiffness: 200,
        });
      }
    });

  const cardAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <View style={styles.wrapper}>
      {/* Delete button - positioned absolutely behind the card */}
      <View style={styles.deleteButtonContainer}>
        <Pressable onPress={confirmDelete} style={styles.deleteButtonPressable}>
          <Trash2 size={22} color="#fff" />
        </Pressable>
      </View>

      {/* Card - slides left to reveal delete button */}
      <GestureDetector gesture={panGesture}>
        <Animated.View style={cardAnimatedStyle}>
          <Card>
            <CardContent className="p-3">
              <View style={styles.header}>
                <Text style={styles.timeRange}>
                  {formatTime(item.start_time)} -{' '}
                  {item.end_time ? formatTime(item.end_time) : 'In Progress'}
                </Text>
                <Text style={styles.duration}>
                  {formatDuration(item.start_time, item.end_time)}
                </Text>
              </View>

              {item.notes && <Text style={styles.notes}>{item.notes}</Text>}

              {(property || billingCategory) && (
                <View style={styles.details}>
                  {property && (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Property</Text>
                      <Text style={styles.detailValue}>{property.name}</Text>
                    </View>
                  )}
                  {billingCategory && (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Category</Text>
                      <Text style={styles.detailValue}>
                        {billingCategory.name}
                      </Text>
                    </View>
                  )}
                </View>
              )}
            </CardContent>
          </Card>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: 8,
    position: 'relative', // Allows absolute positioning of delete button
  },
  deleteButtonContainer: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0, // Stretches to match card height
    width: DELETE_BUTTON_WIDTH,
    backgroundColor: '#dc2626',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteButtonPressable: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  timeRange: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0a0a0a',
  },
  duration: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0a0a0a',
  },
  notes: {
    fontSize: 14,
    color: '#0a0a0a',
    marginTop: 8,
    lineHeight: 20,
  },
  details: {
    marginTop: 8,
    gap: 4,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detailLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#999',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    width: 70,
  },
  detailValue: {
    fontSize: 13,
    color: '#0a0a0a',
    flex: 1,
  },
});
