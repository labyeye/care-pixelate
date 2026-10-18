// Tiny SVG charts (react-native-svg is already a dependency) — no extra native module needed.
import React, { useState } from 'react';
import { Text, View, StyleSheet, LayoutChangeEvent } from 'react-native';
import Svg, {
  Circle,
  G,
  Line,
  Path,
  Rect,
  Text as SvgText,
  Defs,
  LinearGradient,
  Stop,
} from 'react-native-svg';
import { C } from './ui';

export type Datum = { label: string; value: number; color?: string };
const PALETTE = [
  C.primary,
  C.secondary,
  C.success,
  C.purple,
  C.danger,
  '#FFD60A',
];

export function BarChart({
  data,
  height = 150,
  color = C.primary,
}: {
  data: Datum[];
  height?: number;
  color?: string;
}) {
  const [w, setW] = useState(0);
  const max = Math.max(1, ...data.map(d => d.value));
  const padL = 26,
    padB = 20,
    padT = 14;
  const innerH = height - padB - padT;
  const slot = data.length ? (w - padL) / data.length : 0;
  const bw = Math.min(34, slot * 0.6);
  return (
    <View
      onLayout={(e: LayoutChangeEvent) =>
        setW(Math.floor(e.nativeEvent.layout.width))
      }
    >
      {w > 0 && (
        <Svg width={w} height={height}>
          {[0, 0.5, 1].map(t => (
            <G key={t}>
              <Line
                x1={padL}
                x2={w}
                y1={padT + innerH * (1 - t)}
                y2={padT + innerH * (1 - t)}
                stroke="#E5E7EB"
                strokeDasharray="3 3"
              />
              <SvgText
                x={padL - 4}
                y={padT + innerH * (1 - t) + 3}
                fontSize={9}
                fill={C.muted}
                textAnchor="end"
              >
                {Math.round(max * t)}
              </SvgText>
            </G>
          ))}
          {data.map((d, i) => {
            const h = (d.value / max) * innerH;
            const x = padL + slot * i + (slot - bw) / 2;
            return (
              <G key={i}>
                <Rect
                  x={x}
                  y={padT + innerH - h}
                  width={bw}
                  height={Math.max(h, d.value ? 2 : 0)}
                  fill={d.color ?? color}
                  stroke={C.black}
                  strokeWidth={1.5}
                />
                <SvgText
                  x={x + bw / 2}
                  y={height - 5}
                  fontSize={9}
                  fontWeight="bold"
                  fill={C.black}
                  textAnchor="middle"
                >
                  {d.label}
                </SvgText>
              </G>
            );
          })}
        </Svg>
      )}
    </View>
  );
}

export function AreaChart({
  data,
  height = 140,
  color = C.primary,
}: {
  data: Datum[];
  height?: number;
  color?: string;
}) {
  const [w, setW] = useState(0);
  const max = Math.max(1, ...data.map(d => d.value));
  const padL = 26,
    padB = 20,
    padT = 10;
  const innerH = height - padB - padT;
  const step = data.length > 1 ? (w - padL - 8) / (data.length - 1) : 0;
  const pts = data.map(
    (d, i) => [padL + step * i, padT + innerH * (1 - d.value / max)] as const,
  );
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x},${y}`).join(' ');
  const area = pts.length
    ? `${line} L${pts[pts.length - 1][0]},${padT + innerH} L${pts[0][0]},${padT + innerH} Z`
    : '';
  const every = Math.ceil(data.length / 6);
  return (
    <View
      onLayout={(e: LayoutChangeEvent) =>
        setW(Math.floor(e.nativeEvent.layout.width))
      }
    >
      {w > 0 && (
        <Svg width={w} height={height}>
          <Defs>
            <LinearGradient id="ag" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={color} stopOpacity={0.3} />
              <Stop offset="1" stopColor={color} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          {[0, 0.5, 1].map(t => (
            <G key={t}>
              <Line
                x1={padL}
                x2={w}
                y1={padT + innerH * (1 - t)}
                y2={padT + innerH * (1 - t)}
                stroke="#E5E7EB"
                strokeDasharray="3 3"
              />
              <SvgText
                x={padL - 4}
                y={padT + innerH * (1 - t) + 3}
                fontSize={9}
                fill={C.muted}
                textAnchor="end"
              >
                {Math.round(max * t)}
              </SvgText>
            </G>
          ))}
          {area ? <Path d={area} fill="url(#ag)" /> : null}
          {line ? (
            <Path d={line} stroke={color} strokeWidth={2.5} fill="none" />
          ) : null}
          {pts.map(([x, y], i) =>
            data.length <= 16 ? (
              <Circle
                key={i}
                cx={x}
                cy={y}
                r={3}
                fill={C.white}
                stroke={color}
                strokeWidth={2}
              />
            ) : null,
          )}
          {data.map((d, i) =>
            i % every === 0 ? (
              <SvgText
                key={i}
                x={pts[i][0]}
                y={height - 5}
                fontSize={9}
                fontWeight="bold"
                fill={C.black}
                textAnchor="middle"
              >
                {d.label}
              </SvgText>
            ) : null,
          )}
        </Svg>
      )}
    </View>
  );
}

export function Donut({ data, size = 120 }: { data: Datum[]; size?: number }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const r = size / 2 - 10;
  const circ = 2 * Math.PI * r;
  let offset = 0;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="#E5E7EB"
          strokeWidth={16}
          fill="none"
        />
        {total > 0 &&
          data.map((d, i) => {
            const len = (d.value / total) * circ;
            const el = (
              <Circle
                key={i}
                cx={size / 2}
                cy={size / 2}
                r={r}
                stroke={d.color ?? PALETTE[i % PALETTE.length]}
                strokeWidth={16}
                fill="none"
                strokeDasharray={`${Math.max(len - 2, 0)} ${circ}`}
                strokeDashoffset={-offset}
                rotation={-90}
                origin={`${size / 2}, ${size / 2}`}
              />
            );
            offset += len;
            return el;
          })}
        <SvgText
          x={size / 2}
          y={size / 2 + 6}
          fontSize={18}
          fontWeight="bold"
          fill={C.black}
          textAnchor="middle"
        >
          {total}
        </SvgText>
      </Svg>
      <View style={{ flex: 1, gap: 5 }}>
        {data.map((d, i) => (
          <View key={i} style={styles.legendRow}>
            <View
              style={[
                styles.dot,
                { backgroundColor: d.color ?? PALETTE[i % PALETTE.length] },
              ]}
            />
            <Text style={styles.legend} numberOfLines={1}>
              {d.label}
            </Text>
            <Text style={styles.legendVal}>{d.value}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/** Horizontal bars, good for "top doctors" / "by payment mode". */
export function HBars({
  data,
  format,
}: {
  data: Datum[];
  format?: (n: number) => string;
}) {
  const max = Math.max(1, ...data.map(d => d.value));
  return (
    <View style={{ gap: 9 }}>
      {data.map((d, i) => (
        <View key={i}>
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              marginBottom: 3,
            }}
          >
            <Text style={styles.legend} numberOfLines={1}>
              {d.label}
            </Text>
            <Text style={styles.legendVal}>
              {format ? format(d.value) : d.value}
            </Text>
          </View>
          <View style={styles.track}>
            <View
              style={[
                styles.fill,
                {
                  width: `${(d.value / max) * 100}%`,
                  backgroundColor: d.color ?? PALETTE[i % PALETTE.length],
                },
              ]}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 10, height: 10, borderWidth: 1.5, borderColor: C.black },
  legend: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    color: C.black,
    textTransform: 'capitalize',
  },
  legendVal: { fontSize: 12, fontWeight: '800', color: C.black },
  track: {
    height: 12,
    borderWidth: 2,
    borderColor: C.black,
    borderRadius: 4,
    backgroundColor: '#F3F4F6',
    overflow: 'hidden',
  },
  fill: { height: '100%' },
});
