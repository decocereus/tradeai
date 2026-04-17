import type { HistoricalCandle, TechnicalAnalysisSnapshot } from "@tradeai/domain";

const average = (values: readonly number[]): number | undefined => {
  if (values.length === 0) return undefined;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const sampleStandardDeviation = (values: readonly number[]): number | undefined => {
  if (values.length < 2) return undefined;
  const mean = average(values);
  if (mean === undefined) return undefined;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
};

export const calculateSma = (
  candles: readonly HistoricalCandle[],
  period: number,
): number | undefined => {
  if (candles.length < period) return undefined;
  const closes = candles.slice(-period).map((candle) => candle.close);
  return average(closes);
};

export const calculateEma = (
  candles: readonly HistoricalCandle[],
  period: number,
): number | undefined => {
  if (candles.length < period) return undefined;
  const closes = candles.map((candle) => candle.close);
  const multiplier = 2 / (period + 1);
  let ema = average(closes.slice(0, period));
  if (ema === undefined) return undefined;

  for (const close of closes.slice(period)) {
    ema = (close - ema) * multiplier + ema;
  }

  return ema;
};

export const calculateRsi = (
  candles: readonly HistoricalCandle[],
  period: number,
): number | undefined => {
  if (candles.length <= period) return undefined;
  const closes = candles.map((candle) => candle.close);
  const deltas = closes.slice(1).map((close, index) => close - closes[index]!);
  const recent = deltas.slice(-period);
  const gains = recent.map((delta) => (delta > 0 ? delta : 0));
  const losses = recent.map((delta) => (delta < 0 ? Math.abs(delta) : 0));
  const averageGain = average(gains);
  const averageLoss = average(losses);

  if (averageGain === undefined || averageLoss === undefined) return undefined;
  if (averageLoss === 0) return 100;
  const relativeStrength = averageGain / averageLoss;
  return 100 - 100 / (1 + relativeStrength);
};

export const calculateReturns = (candles: readonly HistoricalCandle[]): {
  oneDayPct?: number;
  oneMonthPct?: number;
} => {
  const latest = candles.at(-1)?.close;
  const previous = candles.at(-2)?.close;
  const monthAgo = candles.length >= 22 ? candles.at(-22)?.close : undefined;

  const oneDayPct =
    latest !== undefined && previous !== undefined && previous !== 0
      ? ((latest - previous) / previous) * 100
      : undefined;
  const oneMonthPct =
    latest !== undefined && monthAgo !== undefined && monthAgo !== 0
      ? ((latest - monthAgo) / monthAgo) * 100
      : undefined;

  return {
    ...(oneDayPct !== undefined ? { oneDayPct } : {}),
    ...(oneMonthPct !== undefined ? { oneMonthPct } : {}),
  };
};

export const calculateVolatility = (
  candles: readonly HistoricalCandle[],
  period: number,
): number | undefined => {
  if (candles.length <= period) return undefined;
  const closes = candles.slice(-(period + 1)).map((candle) => candle.close);
  const returns = closes.slice(1).map((close, index) => (close - closes[index]!) / closes[index]!);
  const volatility = sampleStandardDeviation(returns);
  return volatility !== undefined ? volatility * 100 : undefined;
};

export const inferTrend = (
  latestClose: number,
  sma20?: number,
  sma50?: number,
  rsi14?: number,
): TechnicalAnalysisSnapshot["trend"] => {
  if (sma20 !== undefined && sma50 !== undefined && latestClose > sma20 && sma20 > sma50) {
    return "bullish";
  }
  if (sma20 !== undefined && sma50 !== undefined && latestClose < sma20 && sma20 < sma50) {
    return "bearish";
  }
  if (rsi14 !== undefined && rsi14 >= 65) return "bullish";
  if (rsi14 !== undefined && rsi14 <= 35) return "bearish";
  return "rangebound";
};

export const analyzeHistoricalCandles = (
  candles: readonly HistoricalCandle[],
): TechnicalAnalysisSnapshot | undefined => {
  const latestClose = candles.at(-1)?.close;
  if (latestClose === undefined) return undefined;

  const sma20 = calculateSma(candles, 20);
  const sma50 = calculateSma(candles, 50);
  const ema20 = calculateEma(candles, 20);
  const rsi14 = calculateRsi(candles, 14);
  const returns = calculateReturns(candles);
  const volatility20d = calculateVolatility(candles, 20);

  return {
    latestClose,
    sma20,
    sma50,
    ema20,
    rsi14,
    oneDayReturnPct: returns.oneDayPct,
    oneMonthReturnPct: returns.oneMonthPct,
    volatility20dPct: volatility20d,
    trend: inferTrend(latestClose, sma20, sma50, rsi14),
  };
};
