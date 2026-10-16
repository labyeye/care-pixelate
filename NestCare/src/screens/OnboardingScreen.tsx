import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Dimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { CalendarCheck, Users, FileHeart } from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';
import Button from '../components/Button';
import storage from '../utils/storage';

const { width } = Dimensions.get('window');

const SLIDES = [
  {
    icon: Users,
    title: 'Meet your care team',
    subtitle: 'Find and connect with doctors across every specialization your clinic offers.',
  },
  {
    icon: CalendarCheck,
    title: 'Book appointments in seconds',
    subtitle: 'Pick a doctor, a slot, and you are done — no phone calls needed.',
  },
  {
    icon: FileHeart,
    title: 'Your health records, organized',
    subtitle: 'Prescriptions, lab reports, vitals and more — all in one timeline.',
  },
];

export default function OnboardingScreen({ navigation }: any) {
  const { colors } = useTheme();
  const [index, setIndex] = useState(0);
  const listRef = useRef<FlatList>(null);

  const finish = async () => {
    await storage.setItem('nestcare_onboarded', 'true');
    navigation.replace('Login');
  };

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    setIndex(i);
  };

  const next = () => {
    if (index < SLIDES.length - 1) {
      listRef.current?.scrollToIndex({ index: index + 1 });
    } else {
      finish();
    }
  };

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]}>
      <FlatList
        ref={listRef}
        data={SLIDES}
        keyExtractor={(_, i) => String(i)}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScroll}
        renderItem={({ item }) => {
          const Icon = item.icon;
          return (
            <View style={[styles.slide, { width }]}>
              <View style={[styles.iconBox, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                <Icon size={48} color={colors.primary} />
              </View>
              <Text style={[styles.title, { color: colors.text }]}>{item.title}</Text>
              <Text style={[styles.subtitle, { color: colors.mutedText }]}>{item.subtitle}</Text>
            </View>
          );
        }}
      />

      <View style={styles.dotsRow}>
        {SLIDES.map((_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              { borderColor: colors.border, backgroundColor: i === index ? colors.primary : colors.surface },
            ]}
          />
        ))}
      </View>

      <View style={styles.footer}>
        <Button
          title={index === SLIDES.length - 1 ? 'Get Started' : 'Next'}
          onPress={next}
        />
        {index < SLIDES.length - 1 && (
          <Text onPress={finish} style={[styles.skip, { color: colors.mutedText }]}>
            Skip
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  slide: { alignItems: 'center', justifyContent: 'center', padding: 32, flex: 1 },
  iconBox: {
    width: 120,
    height: 120,
    borderWidth: 3,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  title: { fontSize: 22, fontWeight: '900', textAlign: 'center', marginBottom: 10 },
  subtitle: { fontSize: 14, fontWeight: '500', textAlign: 'center', lineHeight: 20 },
  dotsRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 20 },
  dot: { width: 10, height: 10, borderWidth: 1.5 },
  footer: { paddingHorizontal: 24, paddingBottom: 32, gap: 14, alignItems: 'center' },
  skip: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase' },
});
